//! Lab 04 — WebRTC Audio (loopback) — Handler Axum (webrtc = "0.13.0")
//
//! Flujo:
//! 1) Valida Origin + Bearer (iss/aud de lab-04).
//! 2) Crea API WebRTC y PeerConnection con STUN públicos.
//! 3) Añade transceiver de AUDIO (sendrecv) y **adjunta track local antes de la señalización**.
//! 4) on_track: al llegar audio remoto, reenvía RTP (eco) escribiendo en el track local.
//!    ⚠️ IMPORTANTE: reescribimos SSRC/PT con los del sender local para que el navegador no descarte.
//!    ❗ No borramos extensiones RTP (MID/transport-cc), necesarias para demultiplexación.
//! 5) Señalización Offer → Answer, espera ICE gathering y responde SDP final.

//==============================\\
//********  IMPORTS  ***********\\
//==============================\\

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Serialize;
use tokio::time::{interval, MissedTickBehavior};
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::rtp_transceiver::rtp_codec::{RTCRtpCodecCapability, RTPCodecType};
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::{TrackLocal, TrackLocalWriter};

use super::stats_helper::install_selected_pair_logger;
use crate::auth::{validate_ws_token_multi, TokenProfile, WsClaims};
use crate::routes::AppState;
//=====================================\\
//********  TIPOS / RESPUESTAS  *******\\
//=====================================\\
#[derive(Serialize)]
pub struct SdpResponse {
  pub sdp: String,
  pub r#type: String,
}

//=====================================\\
//*****  HANDLER PRINCIPAL HTTP  ******\\
//=====================================\\
#[cfg_attr(debug_assertions, axum::debug_handler)]
pub async fn webrtc_offer_lab04(
  State(state): State<AppState>,
  headers: HeaderMap,
  Json(offer_sdp): Json<RTCSessionDescription>,
) -> Result<Json<SdpResponse>, (StatusCode, String)> {
  //=========================================\\
  //*****  (1) SEGURIDAD: ORIGIN + JWT  *****\\
  //=========================================\\
  // 1) Seguridad: Origin + Bearer JWT (perfil lab-04)
  validate_origin(&headers, &state)?;
  let _claims = validate_bearer_lab04(&headers, &state)?;

  //=========================================\\
  //*****  (2) API WEBRTC + PEERCONN     ****\\
  //=========================================\\
  // 2) API WebRTC y PeerConnection con STUN
  let mut m = MediaEngine::default();
  m.register_default_codecs().map_err(internal)?;
  let api = APIBuilder::new().with_media_engine(m).build();

  let config = RTCConfiguration {
    ice_servers: vec![
      RTCIceServer {
        urls: vec!["stun:stun.l.google.com:19302".into()],
        ..Default::default()
      },
      RTCIceServer {
        urls: vec!["stun:stun.cloudflare.com:3478".into()],
        ..Default::default()
      },
    ],
    ..Default::default()
  };

  // PeerConnection
  let pc = Arc::new(api.new_peer_connection(config).await.map_err(internal)?);

  // Señalización y cierre ordenado
  let pc_closed_flag = Arc::new(AtomicBool::new(false));
  // Token de cancelación por PC
  let cancel_pc = CancellationToken::new();

  //=========================================\\
  //*****  (2.1) LOGS / WATCHDOG STATES  ****\\
  //=========================================\\
  // Logs útiles de estado
  {
    // ICE
    let pc_ref = Arc::clone(&pc);
    let cancel_for_ice = cancel_pc.clone();
    let pc_for_ice_close = Arc::clone(&pc);
    let closed_flag_ice = Arc::clone(&pc_closed_flag);
    pc_ref.on_ice_connection_state_change(Box::new(move |st: RTCIceConnectionState| {
      info!("ICE state = {:?}", st);
      if matches!(
        st,
        RTCIceConnectionState::Disconnected | RTCIceConnectionState::Failed | RTCIceConnectionState::Closed
      ) {
        cancel_for_ice.cancel();
        if !closed_flag_ice.swap(true, Ordering::SeqCst) {
          let pc_to_close = Arc::clone(&pc_for_ice_close);
          tokio::spawn(async move {
            if let Err(e) = pc_to_close.close().await {
              warn!("pc.close() error (ICE cb): {e:?}");
            } else {
              info!("PC closed (server-side)");
            }
          });
        }
      }
      Box::pin(async {})
    }));

    // PC
    let pc_ref = Arc::clone(&pc);
    let cancel_for_pc = cancel_pc.clone();
    let pc_for_pc_close = Arc::clone(&pc);
    let closed_flag_pc = Arc::clone(&pc_closed_flag);
    pc_ref.on_peer_connection_state_change(Box::new(move |st: RTCPeerConnectionState| {
      info!("PC state = {:?}", st);
      if matches!(
        st,
        RTCPeerConnectionState::Disconnected | RTCPeerConnectionState::Failed | RTCPeerConnectionState::Closed
      ) {
        cancel_for_pc.cancel();
        if !closed_flag_pc.swap(true, Ordering::SeqCst) {
          let pc_to_close = Arc::clone(&pc_for_pc_close);
          tokio::spawn(async move {
            if let Err(e) = pc_to_close.close().await {
              warn!("pc.close() error (PC cb): {e:?}");
            } else {
              info!("PC closed (server-side)");
            }
          });
        }
      }
      Box::pin(async {})
    }));

    // Pares ICE seleccionados (debug)
    // helper: stats selected pair connection
    install_selected_pair_logger(&pc);
  }

  //================================================\\
  //*****  (3) AUDIO: TRANSCEIVER + TRACK LOCAL  ****\\
  //================================================\\

  // 3.1) Transceiver AUDIO sendrecv (crea m-line de audio)
  pc.add_transceiver_from_kind(RTPCodecType::Audio, None)
    .await
    .map_err(internal)?;

  // 3.2) **Crear y adjuntar TrackLocal RTP (Opus) ANTES de la señalización**
  //      Esto asegura que la SDP local contenga SSRC/MSID del flujo que enviaremos.
  let local_track = Arc::new(TrackLocalStaticRTP::new(
    RTCRtpCodecCapability {
      mime_type: "audio/opus".into(),
      clock_rate: 48000,
      channels: 2,
      sdp_fmtp_line: "".into(),
      rtcp_feedback: vec![],
    },
    "audio".to_string(), // track id
    "lab04".to_string(), // stream id
  ));

  // 3.3) Enganchar el track al **transceiver de audio existente** con replace_track()
  //      (esto garantiza que el RTP salga por la misma m-line/MID que negocia el browser).
  let mut audio_sender_opt = None;
  for (i, t) in pc.get_transceivers().await.iter().enumerate() {
    let dir = t.direction();
    let cur = t.current_direction();
    info!("xcev[{i}] dir={:?} current={:?}", dir, cur);
    if t.kind() == RTPCodecType::Audio {
      let s = t.sender().await;
      audio_sender_opt = Some(s);
      break;
    }
  }

  let rtp_sender = match audio_sender_opt {
    Some(s) => {
      s.replace_track(Some(local_track.clone() as Arc<dyn TrackLocal + Send + Sync>))
        .await
        .map_err(internal)?;
      s
    }
    None => return Err(internal("no audio transceiver found")),
  };

  // 3.4) Mantener vivo el sender leyendo RTCP
  {
    let rtp_sender = rtp_sender.clone();
    tokio::spawn(async move {
      let mut rtcp_buf = vec![0u8; 1500];
      while rtp_sender.read(&mut rtcp_buf).await.is_ok() {}
      info!("RTCP reader ended");
    });
  }

  // 3.5) Obtener SSRC/PT locales negociados del sender (webrtc 0.13)
  let params = rtp_sender.get_parameters().await;
  let local_ssrc: Option<u32> = params.encodings.first().map(|e| e.ssrc);
  let local_pt: Option<u8> = params.rtp_parameters.codecs.first().map(|c| c.payload_type);

  info!(
    "✅ [lab04] sender attached to audio transceiver (local_ssrc={:?} local_pt={:?})",
    local_ssrc, local_pt
  );

  //==================================================\\
  //*****  (4) on_track: LOOPBACK RTP (eco)       *****\\
  //==================================================\\
  // 4) on_track: loopback RTP (eco) — leer remoto y escribir al local_track ya anunciado
  {
    let pc2 = Arc::clone(&pc);
    let cancel_for_ontrack = cancel_pc.clone();
    let local_track_for_cb = local_track.clone();
    let local_ssrc_for_cb = local_ssrc;
    let local_pt_for_cb = local_pt;

    pc.on_track(Box::new(move |track_remote, _receiver, _transceiver| {
            let pc2 = Arc::clone(&pc2);
            let cancel_for_async = cancel_for_ontrack.clone();
            let local_track = local_track_for_cb.clone();

            Box::pin(async move {
                // 4.1) Aceptamos sólo AUDIO.
                if track_remote.kind() != RTPCodecType::Audio {
                    return;
                }

                // 4.2) Log códec remoto
                info!("🛰️ [lab04] track AUDIO remota: codec={:?}", track_remote.codec());

                // 4.3) Bucle principal de eco RTP
                tokio::spawn({
                    let mut pkt_count: u64 = 0;
                    let mut byte_bucket: u64 = 0;
                    let mut out_pkt_count: u64 = 0;
                    let mut out_byte_bucket: u64 = 0;

                    let mut last_log = Instant::now();
                    let mut last_pkt_at = Instant::now();
                    let mut first_ssrc: Option<u32> = None;

                    let mut watchdog = interval(Duration::from_secs(3));
                    watchdog.set_missed_tick_behavior(MissedTickBehavior::Skip);

                    let cancel = cancel_for_async.clone();
                    let pc_for_watch = Arc::clone(&pc2);

                    async move {
                        loop {
                            tokio::select! {
                                _ = cancel.cancelled() => {
                                    let st = pc_for_watch.connection_state();
                                    warn!("🔚 [lab04] cancel received (pc state = {:?}) → stopping RTP loop", st);
                                    break;
                                }
                                res = track_remote.read_rtp() => {
                                    match res {
                                        Ok((mut pkt, _attrs)) => {
                                            let ssrc_in = pkt.header.ssrc;
                                            let seq  = pkt.header.sequence_number;
                                            let ts   = pkt.header.timestamp;
                                            let payload_len = pkt.payload.len();

                                            if first_ssrc.is_none() {
                                                first_ssrc = Some(ssrc_in);
                                                info!("🎙️ [lab04] inbound RTP started: SSRC={ssrc_in}");
                                            }

                                            // ===== INBOUND =====
                                            // Contadores IN
                                            pkt_count += 1;
                                            byte_bucket += payload_len as u64;
                                            last_pkt_at = Instant::now();

                                            // 🔁 REESCRITURA CLAVE: usar SSRC/PT locales del sender
                                            // Reescritura clave → SSRC / PT locales
                                            if let Some(ssrc_local) = local_ssrc_for_cb { pkt.header.ssrc = ssrc_local; }
                                            if let Some(pt_local)  = local_pt_for_cb   { pkt.header.payload_type = pt_local; }

                                            // ❗ NO borrar extensiones RTP (MID, transport-cc, etc.)
                                            //    Mantenerlas permite al navegador demultiplexar correctamente.

                                            // Loopback (OUTBOUND)
                                            // Salida (eco)
                                            match local_track.write_rtp(&pkt).await {
                                                Ok(_) => {
                                                    { /* contadores */ }
                                                    out_pkt_count += 1;
                                                    out_byte_bucket += payload_len as u64;
                                                }
                                                Err(e) => {
                                                    warn!("write_rtp error: {e:?}");
                                                    break;
                                                }
                                            }

                                            if last_log.elapsed() >= Duration::from_secs(1) {
                                                let secs = last_log.elapsed().as_secs_f64().max(1e-3);
                                                let kbps_in = (byte_bucket as f64 * 8.0 / 1000.0) / secs;
                                                let kbps_out = (out_byte_bucket as f64 * 8.0 / 1000.0) / secs;

                                                info!(
                                                    "🎧 [lab04] RTP in: pkts_total={} ~{:.1} kbps | last seq={} ts={} payload={}B  |  🔊 out: pkts_total={} ~{:.1} kbps",
                                                    pkt_count, kbps_in, seq, ts, payload_len,
                                                    out_pkt_count, kbps_out
                                                );

                                                byte_bucket = 0;
                                                out_byte_bucket = 0;
                                                last_log = Instant::now();
                                            }
                                        }
                                        Err(e) => {
                                            warn!("read_rtp ended: {e:?}");
                                            break;
                                        }
                                    }
                                }
                                _ = watchdog.tick() => {
                                    let idle = last_pkt_at.elapsed();
                                    let st = pc_for_watch.connection_state();
                                    if idle >= Duration::from_secs(5) && st != RTCPeerConnectionState::Connected {
                                        warn!("⏳ [lab04] idle {:?} and pc state {:?} → stopping RTP loop", idle, st);
                                        break;
                                    }
                                    if idle >= Duration::from_secs(10) {
                                        warn!("⏳ [lab04] no inbound RTP for {:?} (state={:?})", idle, st);
                                    }
                                }
                            }
                        }
                        info!("🛑 loopback finalizado");
                    }
                });
            })
        }));
  }

  //=============================================\\
  //*****  (5) SEÑALIZACIÓN (OFFER → ANSWER)  ****\\
  //=============================================\\
  // 5.1) Señalización: Offer → Answer
  pc.set_remote_description(offer_sdp).await.map_err(internal)?;
  let answer = pc.create_answer(None).await.map_err(internal)?;

  // 5.2) Esperar ICE gathering para incluir candidatos en la Answer
  let mut gather_rx = pc.gathering_complete_promise().await;
  pc.set_local_description(answer).await.map_err(internal)?;
  let _ = gather_rx.recv().await;

  // 5.3) Responder SDP final
  let local = pc
    .local_description()
    .await
    .ok_or_else(|| internal("missing local_description"))?;
  Ok(Json(SdpResponse {
    sdp: local.sdp,
    r#type: "answer".into(),
  }))
}

//=====================================\\
//*******  HELPERS DE SEGURIDAD  ******\\
//=====================================\\
/* ───────────── Seguridad & Util ───────────── */

fn validate_origin(headers: &HeaderMap, state: &AppState) -> Result<(), (StatusCode, String)> {
  if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
    let ok = state.allowed_ws_origins.iter().any(|o| o == origin);
    if ok {
      return Ok(());
    }
  }
  Err((StatusCode::FORBIDDEN, "invalid origin".into()))
}

fn validate_bearer_lab04(headers: &HeaderMap, state: &AppState) -> Result<WsClaims, (StatusCode, String)> {
  let auth = headers.get("authorization").and_then(|v| v.to_str().ok()).unwrap_or("");
  let token = auth
    .strip_prefix("Bearer ")
    .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer".to_string()))?;

  let allow: Vec<TokenProfile> = state
    .profiles
    .iter()
    .cloned()
    .filter(|p| p.iss == "lab-04" && p.aud == "lab-webrtc-04-audio")
    .collect();

  if allow.is_empty() {
    return Err((
      StatusCode::INTERNAL_SERVER_ERROR,
      "lab-04 profile not configured".into(),
    ));
  }

  validate_ws_token_multi(token, &state.ws_secret, &allow).map_err(|e| {
    warn!("JWT inválido (lab-04): {e}");
    (StatusCode::UNAUTHORIZED, "unauthorized".into())
  })
}

//=====================================\\
//***********  ERRORES  ***************\\
//=====================================\\
fn internal<E: std::fmt::Debug>(e: E) -> (StatusCode, String) {
  error!("Internal error: {e:?}");
  (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
}

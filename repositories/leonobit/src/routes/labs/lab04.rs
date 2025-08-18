//! Lab 04 — WebRTC Audio (loopback) — Handler Axum (webrtc = "0.13.0")
//
//! Flujo:
//! 1) Valida Origin + Bearer (iss/aud de lab-04).
//! 2) Crea API WebRTC y PeerConnection con STUN públicos.
//! 3) Añade transceiver de AUDIO (sendrecv).
//! 4) on_track: al llegar audio remoto, crea TrackLocal Opus y reenvía RTP (eco).
//!    ⚠️ IMPORTANTE: reescribimos SSRC/PT con los del sender local para que el navegador no descarte.
//! 5) Señalización Offer → Answer, espera ICE gathering y responde SDP final.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use axum::{extract::State, http::{HeaderMap, StatusCode}, Json};
use serde::Serialize;
use tracing::{info, warn, error};

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

use crate::routes::AppState;
use crate::auth::{validate_ws_token_multi, TokenProfile, WsClaims};

use std::time::{Duration, Instant};
use tokio::time::{interval, MissedTickBehavior};
use tokio_util::sync::CancellationToken;

use super::stats_helper::install_selected_pair_logger;

#[derive(Serialize)]
pub struct SdpResponse { pub sdp: String, pub r#type: String }

#[axum::debug_handler]
pub async fn webrtc_offer_lab04(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(offer_sdp): Json<RTCSessionDescription>,
) -> Result<Json<SdpResponse>, (StatusCode, String)> {
    // 1) Seguridad: Origin + Bearer JWT (perfil lab-04)
    validate_origin(&headers, &state)?;
    let _claims = validate_bearer_lab04(&headers, &state)?;

    // 2) API WebRTC y PeerConnection con STUN
    let mut m = MediaEngine::default();
    m.register_default_codecs().map_err(internal)?;
    let api = APIBuilder::new().with_media_engine(m).build();

    let config = RTCConfiguration {
        ice_servers: vec![
            RTCIceServer { urls: vec!["stun:stun.l.google.com:19302".into()], ..Default::default() },
            RTCIceServer { urls: vec!["stun:stun.cloudflare.com:3478".into()], ..Default::default() },
        ],
        ..Default::default()
    };

    // PeerConnection
    let pc = Arc::new(api.new_peer_connection(config).await.map_err(internal)?);

    let pc_closed_flag = Arc::new(AtomicBool::new(false)); // 🔧

    // 🔧 Token de cancelación por PC (lo compartimos entre handlers y el loop RTP)
    let cancel_pc = CancellationToken::new();

    // Logs útiles de estado (opcional)
    {
        let pc_ref = Arc::clone(&pc);
        let cancel_for_ice = cancel_pc.clone();
        let pc_for_ice_close = Arc::clone(&pc);
        let closed_flag_ice = Arc::clone(&pc_closed_flag);
        pc_ref.on_ice_connection_state_change(Box::new(move |st: RTCIceConnectionState| {
            info!("ICE state = {:?}", st);
            if matches!(st, RTCIceConnectionState::Disconnected | RTCIceConnectionState::Failed | RTCIceConnectionState::Closed) {
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

        let pc_ref = Arc::clone(&pc);
        let cancel_for_pc = cancel_pc.clone();
        let pc_for_pc_close = Arc::clone(&pc);
        let closed_flag_pc = Arc::clone(&pc_closed_flag);
        pc_ref.on_peer_connection_state_change(Box::new(move |st: RTCPeerConnectionState| {
            info!("PC state = {:?}", st);
            if matches!(st, RTCPeerConnectionState::Disconnected | RTCPeerConnectionState::Failed | RTCPeerConnectionState::Closed) {
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

        // stats selected pair connection
        install_selected_pair_logger(&pc);
    }

    // 3) Transceiver AUDIO sendrecv
    pc.add_transceiver_from_kind(RTPCodecType::Audio, None)
        .await
        .map_err(internal)?;

    // 4) on_track: loopback RTP (eco) con reescritura de SSRC/PT
    {
        let pc2 = Arc::clone(&pc);
        let cancel_for_ontrack = cancel_pc.clone();

        pc.on_track(Box::new(move |track_remote, _receiver, _transceiver| {
            let pc2 = Arc::clone(&pc2);
            let cancel_for_async = cancel_for_ontrack.clone();

            Box::pin(async move {
                // 1) Aceptamos sólo AUDIO.
                if track_remote.kind() != RTPCodecType::Audio {
                    return;
                }

                // 2) Log códec remoto
                info!("🛰️ [lab04] track AUDIO remota: codec={:?}", track_remote.codec());

                // 3) Pista local RTP (Opus) para eco
                let local_track = Arc::new(TrackLocalStaticRTP::new(
                    RTCRtpCodecCapability {
                        mime_type: "audio/opus".into(),
                        clock_rate: 48000,
                        channels: 2,
                        sdp_fmtp_line: "".into(),
                        rtcp_feedback: vec![],
                    },
                    "audio".to_string(),
                    "lab04".to_string(),
                ));

                // 4) Adjuntar al PC (no fuerza renegociación)
                let sender_res = pc2
                    .add_track(Arc::clone(&local_track) as Arc<dyn TrackLocal + Send + Sync>)
                    .await;

                let rtp_sender = match sender_res {
                    Ok(s) => s,
                    Err(e) => {
                        warn!("add_track error: {e:?}");
                        return;
                    }
                };

                // 🔑 OBTENER SSRC/PT LOCALES NEGOCIADOS PARA EL SENDER (webrtc 0.13)
                // get_parameters() -> RTCRtpSendParameters (no Result)
                let params = rtp_sender.get_parameters().await;

                let mut local_ssrc: Option<u32> = None;
                let mut local_pt:   Option<u8>  = None;

                // SSRC suele venir en encodings[0].ssrc (u32)
                if let Some(enc0) = params.encodings.get(0) {
                    // enc0.ssrc es u32 -> guardamos como Some(u32)
                    local_ssrc = Some(enc0.ssrc);
                }

                // Payload Type (PT) viene en rtp_parameters.codecs[0].payload_type (u8)
                if let Some(codec0) = params.rtp_parameters.codecs.get(0) {
                    local_pt = Some(codec0.payload_type);
                }

                info!(
                    "✅ [lab04] sender attached to audio transceiver (local_ssrc={:?} local_pt={:?})",
                    local_ssrc, local_pt
                );


                // 5) Lector RTCP para mantener vivo el sender
                tokio::spawn({
                    let mut rtcp_buf = vec![0u8; 1500];
                    async move {
                        while let Ok(_) = rtp_sender.read(&mut rtcp_buf).await {}
                        info!("RTCP reader ended");
                    }
                });

                // 6) Bucle principal de eco RTP con reescritura de header
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
                    let local_track = Arc::clone(&local_track);
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
                                            pkt_count += 1;
                                            byte_bucket += payload_len as u64;
                                            last_pkt_at = Instant::now();

                                            // 🔁 REESCRITURA CLAVE: usar SSRC/PT locales del sender
                                            if let Some(ssrc_local) = local_ssrc { pkt.header.ssrc = ssrc_local; }
                                            if let Some(pt_local)  = local_pt   { pkt.header.payload_type = pt_local; }

                                            // 🔧 MUY IMPORTANTE: limpiar extensiones RTP que el sender local NO negoció
                                            pkt.header.extension = false;
                                            pkt.header.extensions.clear();

                                            // (opcional pero sano) evita marcadores heredados
                                            pkt.header.marker = false;

                                            // Loopback (OUTBOUND)
                                            match local_track.write_rtp(&pkt).await {
                                                Ok(_) => {
                                                    { /* contadores… */ }
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

    // 5) Señalización: Offer → Answer
    pc.set_remote_description(offer_sdp).await.map_err(internal)?;
    let answer = pc.create_answer(None).await.map_err(internal)?;

    // Esperar ICE gathering para incluir candidatos en la Answer
    let mut gather_rx = pc.gathering_complete_promise().await;
    pc.set_local_description(answer).await.map_err(internal)?;
    let _ = gather_rx.recv().await;

    // 6) Responder SDP final
    let local = pc.local_description().await.ok_or_else(|| internal("missing local_description"))?;
    Ok(Json(SdpResponse { sdp: local.sdp, r#type: "answer".into() }))
}

/* ───────────── Seguridad & Util ───────────── */

fn validate_origin(headers: &HeaderMap, state: &AppState) -> Result<(), (StatusCode, String)> {
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        let ok = state.allowed_ws_origins.iter().any(|o| o == origin);
        if ok { return Ok(()); }
    }
    Err((StatusCode::FORBIDDEN, "invalid origin".into()))
}

fn validate_bearer_lab04(headers: &HeaderMap, state: &AppState) -> Result<WsClaims, (StatusCode, String)> {
    let auth = headers.get("authorization").and_then(|v| v.to_str().ok()).unwrap_or("");
    let token = auth.strip_prefix("Bearer ").ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer".to_string()))?;

    let allow: Vec<TokenProfile> = state
        .profiles
        .iter()
        .cloned()
        .filter(|p| p.iss == "lab-04" && p.aud == "lab-webrtc-04-audio")
        .collect();

    if allow.is_empty() {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "lab-04 profile not configured".into()));
    }

    validate_ws_token_multi(token, &state.ws_secret, &allow).map_err(|e| {
        warn!("JWT inválido (lab-04): {e}");
        (StatusCode::UNAUTHORIZED, "unauthorized".into())
    })
}

fn internal<E: std::fmt::Debug>(e: E) -> (StatusCode, String) {
    error!("Internal error: {e:?}");
    (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
}

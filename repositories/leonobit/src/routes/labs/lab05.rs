//! Lab 05 — WebRTC Audio (loopback base) — Handler Axum (webrtc = "0.13.0")
//!
//! Etapa 0 (base): mismo loopback que Lab-04 para validar el pipeline WebRTC
//! con perfiles y handler de Lab-05. Sobre este esqueleto iremos sumando:
//! STT (whisper-rs), GPT-4o y TTS (ElevenLabs).

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
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

use tokio::time::{interval, MissedTickBehavior};
use tokio_util::sync::CancellationToken;

use crate::routes::AppState;
use crate::auth::{validate_ws_token_multi, TokenProfile, WsClaims};

// Si lo usaste en Lab-04, mantenemos el helper de stats:
use super::stats_helper::install_selected_pair_logger;

#[derive(Serialize)]
pub struct SdpResponse { pub sdp: String, pub r#type: String }

#[axum::debug_handler]
pub async fn handle_lab05(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(offer_sdp): Json<RTCSessionDescription>,
) -> Result<Json<SdpResponse>, (StatusCode, String)> {
    // (1) Seguridad: Origin + Bearer JWT (perfil lab-05)
    validate_origin(&headers, &state)?;
    let _claims = validate_bearer_lab05(&headers, &state)?;

    // (2) API WebRTC y PeerConnection con STUN
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

    let pc = Arc::new(api.new_peer_connection(config).await.map_err(internal)?);

    // Señalización y cierre ordenado
    let pc_closed_flag = Arc::new(AtomicBool::new(false));
    let cancel_pc = CancellationToken::new();

    // (2.1) Logs / watchdog de estados
    {
        // ICE
        let pc_ref = Arc::clone(&pc);
        let cancel_for_ice = cancel_pc.clone();
        let pc_for_ice_close = Arc::clone(&pc);
        let closed_flag_ice = Arc::clone(&pc_closed_flag);
        pc_ref.on_ice_connection_state_change(Box::new(move |st: RTCIceConnectionState| {
            info!("(lab05) ICE state = {:?}", st);
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

        // PC
        let pc_ref = Arc::clone(&pc);
        let cancel_for_pc = cancel_pc.clone();
        let pc_for_pc_close = Arc::clone(&pc);
        let closed_flag_pc = Arc::clone(&pc_closed_flag);
        pc_ref.on_peer_connection_state_change(Box::new(move |st: RTCPeerConnectionState| {
            info!("(lab05) PC state = {:?}", st);
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

        // Pares ICE seleccionados (debug)
        install_selected_pair_logger(&pc);
    }

    // (3) AUDIO: transceiver + track local (adjunto ANTES de señalización)
    pc.add_transceiver_from_kind(RTPCodecType::Audio, None)
        .await
        .map_err(internal)?;

    let local_track = Arc::new(TrackLocalStaticRTP::new(
        RTCRtpCodecCapability {
            mime_type: "audio/opus".into(),
            clock_rate: 48000,
            channels: 2,
            sdp_fmtp_line: "".into(),
            rtcp_feedback: vec![],
        },
        "audio".to_string(), // track id
        "lab05".to_string(), // stream id
    ));

    let mut audio_sender_opt = None;
    for (i, t) in pc.get_transceivers().await.iter().enumerate() {
        let dir = t.direction();
        let cur = t.current_direction();
        info!("(lab05) xcev[{i}] dir={:?} current={:?}", dir, cur);
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

    // Mantener vivo el sender leyendo RTCP
    {
        let rtp_sender = rtp_sender.clone();
        tokio::spawn(async move {
            let mut rtcp_buf = vec![0u8; 1500];
            while let Ok(_) = rtp_sender.read(&mut rtcp_buf).await {}
            info!("(lab05) RTCP reader ended");
        });
    }

    // Obtener SSRC/PT locales negociados
    let params = rtp_sender.get_parameters().await;
    let local_ssrc: Option<u32> = params.encodings.get(0).map(|e| e.ssrc);
    let local_pt:   Option<u8>  = params.rtp_parameters.codecs.get(0).map(|c| c.payload_type);
    info!("✅ [lab05] sender attached (local_ssrc={:?} local_pt={:?})", local_ssrc, local_pt);

    // (4) on_track: loopback RTP (eco) — igual que Lab-04
    {
        let pc2 = Arc::clone(&pc);
        let cancel_for_ontrack = cancel_pc.clone();
        let local_track_for_cb = local_track.clone();
        let local_ssrc_for_cb = local_ssrc;
        let local_pt_for_cb   = local_pt;

        pc.on_track(Box::new(move |track_remote, _receiver, _transceiver| {
            let pc2 = Arc::clone(&pc2);
            let cancel_for_async = cancel_for_ontrack.clone();
            let local_track = local_track_for_cb.clone();

            Box::pin(async move {
                if track_remote.kind() != RTPCodecType::Audio {
                    return;
                }

                info!("🛰️ [lab05] remote AUDIO track: codec={:?}", track_remote.codec());

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
                                    warn!("🔚 [lab05] cancel received (pc state = {:?}) → stopping RTP loop", st);
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
                                                info!("🎙️ [lab05] inbound RTP started: SSRC={ssrc_in}");
                                            }

                                            // Contadores IN
                                            pkt_count += 1;
                                            byte_bucket += payload_len as u64;
                                            last_pkt_at = Instant::now();

                                            // Reescritura SSRC/PT con los del sender local
                                            if let Some(ssrc_local) = local_ssrc_for_cb { pkt.header.ssrc = ssrc_local; }
                                            if let Some(pt_local)  = local_pt_for_cb   { pkt.header.payload_type = pt_local; }

                                            // NO borrar extensiones RTP

                                            // Eco OUT
                                            match local_track.write_rtp(&pkt).await {
                                                Ok(_) => {
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
                                                    "🎧 [lab05] RTP in: pkts_total={} ~{:.1} kbps | last seq={} ts={} payload={}B  |  🔊 out: pkts_total={} ~{:.1} kbps",
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
                                        warn!("⏳ [lab05] idle {:?} and pc state {:?} → stopping RTP loop", idle, st);
                                        break;
                                    }
                                    if idle >= Duration::from_secs(10) {
                                        warn!("⏳ [lab05] no inbound RTP for {:?} (state={:?})", idle, st);
                                    }
                                }
                            }
                        }
                        info!("🛑 [lab05] loopback finalizado");
                    }
                });
            })
        }));
    }

    // (5) Señalización (Offer → Answer con ICE gathering)
    pc.set_remote_description(offer_sdp).await.map_err(internal)?;
    let answer = pc.create_answer(None).await.map_err(internal)?;
    let mut gather_rx = pc.gathering_complete_promise().await;
    pc.set_local_description(answer).await.map_err(internal)?;
    let _ = gather_rx.recv().await;

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

fn validate_bearer_lab05(headers: &HeaderMap, state: &AppState) -> Result<WsClaims, (StatusCode, String)> {
    let auth = headers.get("authorization").and_then(|v| v.to_str().ok()).unwrap_or("");
    let token = auth.strip_prefix("Bearer ").ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer".to_string()))?;

    let allow: Vec<TokenProfile> = state
        .profiles
        .iter()
        .cloned()
        .filter(|p| p.iss == "lab-05" && p.aud == "lab-webrtc-05-audio")
        .collect();

    if allow.is_empty() {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "lab-05 profile not configured".into()));
    }

    validate_ws_token_multi(token, &state.ws_secret, &allow).map_err(|e| {
        warn!("JWT inválido (lab-05): {e}");
        (StatusCode::UNAUTHORIZED, "unauthorized".into())
    })
}

fn internal<E: std::fmt::Debug>(e: E) -> (StatusCode, String) {
    error!("Internal error: {e:?}");
    (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
}

//! Lab 04 — WebRTC Audio (loopback) — Handler Axum (webrtc = "0.13.0")
//!
//! Flujo:
//! 1) Valida Origin + Bearer (iss/aud de lab-04).
//! 2) Crea API WebRTC y PeerConnection con STUN públicos.
//! 3) Añade transceiver de AUDIO (sendrecv).
//! 4) on_track: al llegar audio remoto, crea TrackLocal Opus y reenvía RTP (eco).
//! 5) Señalización Offer → Answer, espera ICE gathering y responde SDP final.

use std::sync::Arc;
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
// ❗ No importamos RTCRtpTransceiverInit ni RTPReceiver: evitamos rutas que cambiaron.

use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::{TrackLocal, TrackLocalWriter}; // <- para write_rtp()

use crate::routes::AppState;
use crate::auth::{validate_ws_token_multi, TokenProfile, WsClaims};

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

    // Logs útiles de estado (opcional)
    {
        let pc_ref = Arc::clone(&pc); // Logs: ICE state = Checking → ICE state = Connected
        pc_ref.on_ice_connection_state_change(Box::new(move |st: RTCIceConnectionState| {
            info!("ICE state = {:?}", st);
            Box::pin(async {})
        }));
        let pc_ref = Arc::clone(&pc); // Logs: PC state = Connecting → PC state = Connected
        pc_ref.on_peer_connection_state_change(Box::new(move |st: RTCPeerConnectionState| {
            info!("PC state = {:?}", st);
            Box::pin(async {})
        }));

        // stats selected pair connection
        install_selected_pair_logger(&pc);
    }

    // 3) Transceiver AUDIO sendrecv
    //    En 0.13 podemos pasar None (dirección por defecto = SendRecv).
    pc.add_transceiver_from_kind(RTPCodecType::Audio, None)
        .await
        .map_err(internal)?;

    // 4) on_track: loopback RTP (eco)
    {
        let pc2 = Arc::clone(&pc);

        // ⬇️ Recibimos directamente Arc<TrackRemote>, más los otros dos args que no usamos.
        pc.on_track(Box::new(move |track_remote, _receiver, _transceiver| {
            let pc2 = Arc::clone(&pc2);
            Box::pin(async move {
                // Solo procesamos audio
                if track_remote.kind() != RTPCodecType::Audio {
                    return;
                }

                // En 0.13 codec() no es async
                info!("🛰️ [lab04] track AUDIO remota: codec={:?}", track_remote.codec());

                // Track local Opus (48kHz, 2 ch)
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

                // add_track requiere Arc<dyn TrackLocal + Send + Sync>
                let sender_res = pc2
                    .add_track(Arc::clone(&local_track) as Arc<dyn TrackLocal + Send + Sync>)
                    .await;

                let rtp_sender = match sender_res {
                    Ok(s) => s,
                    Err(e) => { warn!("add_track error: {e:?}"); return; }
                };

                // Mantener vivo el sender leyendo RTCP
                tokio::spawn({
                    let mut rtcp_buf = vec![0u8; 1500];
                    async move {
                        while let Ok(_) = rtp_sender.read(&mut rtcp_buf).await {}
                    }
                });

                // Loop RTP: read_rtp() → (Packet, attrs). Enviamos solo el Packet.
                tokio::spawn(async move {
                    loop {
                        match track_remote.read_rtp().await {
                            Ok((pkt, _attrs)) => {
                                if let Err(e) = local_track.write_rtp(&pkt).await {
                                    warn!("write_rtp error: {e:?}");
                                    break;
                                }
                            }
                            Err(e) => {
                                warn!("read_rtp ended: {e:?}");
                                break;
                            }
                        }
                    }
                    info!("🛑 loopback finalizado");
                });
            })
        }));
    }

    // 5) Señalización: Offer → Answer
    // → have-remote-offer
    pc.set_remote_description(offer_sdp).await.map_err(internal)?;
    let answer = pc.create_answer(None).await.map_err(internal)?;

    // Esperar ICE gathering para incluir candidatos en la Answer
    let mut gather_rx = pc.gathering_complete_promise().await;
    // → stable
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

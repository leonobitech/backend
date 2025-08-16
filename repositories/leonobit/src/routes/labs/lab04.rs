use std::sync::Arc;
use axum::{extract::State, http::{HeaderMap, StatusCode}, Json};
use serde::Serialize;
use tracing::{info, warn, error};

use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::rtp_transceiver::rtp_codec::{RTPCodecCapability, RTPCodecType};
use webrtc::rtp_transceiver::rtp_transceiver_direction::RTCRtpTransceiverDirection;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;

use crate::routes::AppState;
use crate::auth::{validate_ws_token_multi, TokenProfile, WsClaims};

#[derive(Serialize)]
pub struct SdpResponse { pub sdp: String, pub r#type: String }

#[axum::debug_handler]
pub async fn webrtc_offer_lab04(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(offer_sdp): Json<RTCSessionDescription>,
) -> Result<Json<SdpResponse>, (StatusCode, String)> {
    // Seguridad (reutiliza helpers del lab03 si querés)
    validate_origin(&headers, &state)?;
    let _claims = validate_bearer_lab04(&headers, &state)?; // aud/iss distintos para lab-04 si lo deseas

    // API WebRTC
    let mut m = MediaEngine::default();
    m.register_default_codecs().map_err(internal)?;
    let api = APIBuilder::new().with_media_engine(m).build();

    // PC con STUN
    let config = RTCConfiguration {
        ice_servers: vec![
            RTCIceServer { urls: vec!["stun:stun.l.google.com:19302".into()], ..Default::default() },
            RTCIceServer { urls: vec!["stun:stun.cloudflare.com:3478".into()], ..Default::default() },
        ],
        ..Default::default()
    };
    let pc = Arc::new(api.new_peer_connection(config).await.map_err(internal)?);

    // Declaramos transceiver AUDIO sendrecv (queremos recibir y también enviar eco)
    pc.add_transceiver_from_kind(RTPCodecType::Audio, &[
        RTCRtpTransceiverDirection::Sendrecv
    ]).await.map_err(internal)?;

    // Cuando llegue una pista remota, creamos una pista local RTP y reenviamos los paquetes
    {
        let pc2 = Arc::clone(&pc);
        pc.on_track(Box::new(move |track_remote, _receiver| {
            let pc2 = Arc::clone(&pc2);
            Box::pin(async move {
                if track_remote.kind() != RTPCodecType::Audio {
                    return;
                }
                info!("🛰️ [lab04] audio track remota: codec={:?}", track_remote.codec().await);

                // Pista local RTP (eco) con perfil de Opus
                let local_track = Arc::new(TrackLocalStaticRTP::new(
                    RTPCodecCapability {
                        mime_type: "audio/opus".into(),
                        clock_rate: 48000,
                        channels: 2,
                        sdp_fmtp_line: "".into(),
                        rtcp_feedback: vec![],
                    },
                    "audio",   // id
                    "lab04",   // stream id
                ));

                // Enviamos esta pista local al peer (para que llegue como "remota" al cliente)
                let rtp_sender = match pc2.add_track(Arc::clone(&local_track)).await {
                    Ok(s) => s,
                    Err(e) => { warn!("add_track error: {e:?}"); return; }
                };

                // Loop de lectura de RTP entrante y escritura al track local (eco)
                tokio::spawn(async move {
                    // Opcional: RTCP reader para mantener sender vivo
                    let _ = tokio::spawn(async move {
                        let mut rtcp_buf = vec![0u8; 1500];
                        while let Ok(_) = rtp_sender.read(&mut rtcp_buf).await {}
                    });

                    loop {
                        match track_remote.read_rtp().await {
                            Ok(pkt) => {
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

    // Señalización: Offer → Answer
    pc.set_remote_description(offer_sdp).await.map_err(internal)?;
    let answer = pc.create_answer(None).await.map_err(internal)?;

    // Esperar ICE gathering completo
    let mut gather_rx = pc.gathering_complete_promise().await;
    pc.set_local_description(answer).await.map_err(internal)?;
    let _ = gather_rx.recv().await;

    // Devolver Answer final
    let local = pc.local_description().await.ok_or_else(|| internal("missing local_description"))?;
    Ok(Json(SdpResponse { sdp: local.sdp, r#type: "answer".into() }))
}

/* Helpers mínimos (puedes copiar del lab03 y ajustar perfiles/claims) */

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

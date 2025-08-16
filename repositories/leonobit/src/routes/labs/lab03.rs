use std::{
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Serialize;
use tokio::time::interval;
use tracing::{error, info, warn};

use crate::auth::{validate_ws_token_multi, TokenProfile, WsClaims};
use crate::metrics::MetricEvent;
use crate::routes::AppState;

use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::RTCDataChannel;
use webrtc::data_channel::data_channel_state::RTCDataChannelState;
use webrtc::ice_transport::ice_candidate::RTCIceCandidate;
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

#[derive(Serialize)]
pub struct SdpResponse {
    pub sdp: String,
    pub r#type: String,
}

#[axum::debug_handler]
pub async fn webrtc_offer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(offer_sdp): Json<RTCSessionDescription>,
) -> Result<Json<SdpResponse>, (StatusCode, String)> {
    // Seguridad: Origin + Bearer (perfil específico lab-03)
    validate_origin(&headers, &state)?;
    let claims = validate_bearer_lab03(&headers, &state)?;
    info!("✅ [lab-03] autorizado: sub={} role={:?}", claims.sub, claims.role);

    // API WebRTC
    let mut m = MediaEngine::default();
    m.register_default_codecs().map_err(internal)?;
    let api = APIBuilder::new().with_media_engine(m).build();

    let config = RTCConfiguration {
        ice_servers: vec![RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            ..Default::default()
        }],
        ..Default::default()
    };

    let pc = Arc::new(api.new_peer_connection(config).await.map_err(internal)?);

    // Observabilidad de estados y candidatos
    {
        pc.on_ice_connection_state_change(Box::new(move |st: RTCIceConnectionState| {
            info!("ICE state = {:?}", st);
            Box::pin(async {})
        }));

        pc.on_peer_connection_state_change(Box::new(move |st: RTCPeerConnectionState| {
            info!("PC state = {:?}", st);
            Box::pin(async {})
        }));

        pc.on_ice_candidate(Box::new(move |c: Option<RTCIceCandidate>| {
            if let Some(c) = c {
                match c.to_json() {
                    Ok(parsed) => {
                        // parsed es RTCIceCandidateInit: solo tiene candidate/sdp_mid/sdp_mline_index/ufrag
                        let cand = parsed.candidate;
                        // Extra pequeño: intenta extraer el tipo (host/srflx/relay) del string
                        let cand_typ = cand
                            .split_whitespace()
                            .collect::<Vec<_>>()
                            .windows(2)
                            .find_map(|w| if w[0] == "typ" { Some(w[1]) } else { None })
                            .unwrap_or("?");
                        info!("🧊 local ICE candidate: [{}] {}", cand_typ, cand);
                    }
                    Err(e) => warn!("No se pudo serializar ICE candidate: {e:?}"),
                }
            } else {
                info!("🧊 ICE gathering complete (server)");
            }
            Box::pin(async {})
        }));
    }

    // --- SOLO recibir DataChannels creados por el cliente ---
    {
        let tx = state.metrics_tx.clone();
        pc.on_data_channel(Box::new(move |dc: Arc<RTCDataChannel>| {
            let tx = tx.clone();
            Box::pin(async move {
                let label = Arc::new(dc.label().to_owned());
                info!("🔔 on_data_channel (server) ← '{}'", label);
                attach_dc_handlers(dc.clone(), tx.clone(), label.clone()).await;
            })
        }));
    }

    // 1) SDP remoto (offer) → set_remote_description
    pc.set_remote_description(offer_sdp).await.map_err(internal)?;

    // 2) Crear answer y esperar a que termine el ICE gathering
    let answer = pc.create_answer(None).await.map_err(internal)?;
    let mut gather_rx = pc.gathering_complete_promise().await;
    pc.set_local_description(answer).await.map_err(internal)?;
    let _ = gather_rx.recv().await;

    // 3) Tomar el SDP final (con candidates) desde local_description
    let local = pc
        .local_description()
        .await
        .ok_or_else(|| internal("missing local_description"))?;
    info!("📜 Enviando SDP answer (len={} chars)", local.sdp.len());

    Ok(Json(SdpResponse {
        sdp: local.sdp,
        r#type: "answer".into(),
    }))
}

/// Adjunta handlers de open/message/close a un datachannel concreto
async fn attach_dc_handlers(
    dc: Arc<RTCDataChannel>,
    tx: tokio::sync::mpsc::Sender<crate::metrics::MetricEvent>,
    label_log: Arc<String>,
) {
    // Clones para cada callback (evita mover `dc`/`label_log` múltiples veces)
    let dc_for_open = dc.clone();
    let dc_for_msg = dc.clone();

    let label_for_open = label_log.clone();
    let label_for_close = label_log.clone();

    // on_open → PING 1s (cortar si deja de estar Open)
    dc.on_open(Box::new(move || {
        let dc = dc_for_open.clone();
        let label = label_for_open.clone();
        Box::pin(async move {
            info!("DataChannel '{}' abierto (server-side)", label);
            let mut tick = interval(Duration::from_millis(1000));
            loop {
                tick.tick().await;
                if dc.ready_state() != RTCDataChannelState::Open {
                    info!("'{}' ya no está Open → detenemos PING", label);
                    break;
                }
                let now_ms = now_millis();
                let payload = format!(r#"{{"kind":"PING","t":{now_ms}}}"#);
                if let Err(e) = dc.send_text(payload).await {
                    warn!("Error enviando PING: {e:?} → stop PING");
                    break;
                }
            }
        })
    }));

    // on_message → calcula RTT y responde ECHO
    {
        let tx_msg = tx.clone();
        dc.on_message(Box::new(move |msg| {
            let tx = tx_msg.clone();
            let dc = dc_for_msg.clone();
            Box::pin(async move {
                if let Ok(txt) = std::str::from_utf8(msg.data.as_ref()) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(txt) {
                        let kind = val.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                        let t0 = val.get("t").and_then(|v| v.as_f64()).unwrap_or(0.0);
                        if (kind.eq_ignore_ascii_case("PING") || kind.eq_ignore_ascii_case("ECHO")) && t0 > 0.0 {
                            let rtt_ms = (now_millis() - t0).abs();
                            let us = (rtt_ms * 1000.0).round() as u64;
                            let _ = tx.send(MetricEvent::RttMicros(us)).await;

                            // ECHO back para que el cliente mida
                            let echo = format!(r#"{{"kind":"ECHO","t":{}}}"#, t0);
                            let _ = dc.send_text(echo).await;
                            return;
                        }
                    }
                }
                // Si no es JSON válido, podrías loguear raw si te interesa:
                // info!("DC raw msg: {:?}", String::from_utf8_lossy(msg.data.as_ref()));
            })
        }));
    }

    dc.on_close(Box::new(move || {
        let label = label_for_close.clone();
        info!("DataChannel '{}' cerrado (server-side)", label);
        Box::pin(async {})
    }));
}

// ---------- Seguridad y util ----------

fn validate_origin(headers: &HeaderMap, state: &AppState) -> Result<(), (StatusCode, String)> {
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        let ok = state.allowed_ws_origins.iter().any(|o| o == origin);
        if ok {
            return Ok(());
        }
    }
    Err((StatusCode::FORBIDDEN, "invalid origin".into()))
}

fn validate_bearer_lab03(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<WsClaims, (StatusCode, String)> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let token = auth
        .strip_prefix("Bearer ")
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer".to_string()))?;

    let allow: Vec<TokenProfile> = state
        .profiles
        .iter()
        .cloned()
        .filter(|p| p.iss == "lab-03" && p.aud == "lab-webrtc-03-metrics")
        .collect();

    if allow.is_empty() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "lab-03 profile not configured".into(),
        ));
    }

    validate_ws_token_multi(token, &state.ws_secret, &allow).map_err(|e| {
        warn!("JWT inválido (lab-03): {e}");
        (StatusCode::UNAUTHORIZED, "unauthorized".into())
    })
}

fn internal<E: std::fmt::Debug>(e: E) -> (StatusCode, String) {
    error!("Internal error: {e:?}");
    (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
}

fn now_millis() -> f64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    (now.as_micros() as f64) / 1000.0
}

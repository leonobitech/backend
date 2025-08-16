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
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
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
    Json(offer_sdp): Json<RTCSessionDescription>, // { type: "offer", sdp: "..." }
) -> Result<Json<SdpResponse>, (StatusCode, String)> {
    // 1) Seguridad
    validate_origin(&headers, &state)?;
    let claims = validate_bearer_lab03(&headers, &state)?;
    info!("✅ [lab-03] autorizado: sub={} role={:?}", claims.sub, claims.role);

    // 2) Construir API WebRTC
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

    // Logs de estado/ICE
    {
        let pc_cl = pc.clone();
        pc.on_ice_connection_state_change(Box::new(move |st| {
            Box::pin(async move {
                info!("ICE state = {:?}", st);
            })
        }));
        pc_cl.on_peer_connection_state_change(Box::new(move |st| {
            Box::pin(async move {
                info!("PC state = {:?}", st);
            })
        }));
        pc.on_ice_candidate(Box::new(move |cand| {
            Box::pin(async move {
                if let Some(c) = cand {
                    info!("🧊 local ICE candidate: {}", c.to_string());
                } else {
                    info!("🧊 ICE gathering complete (server)");
                }
            })
        }));
    }

    // 3) DataChannel para RTT
    let dc = pc
        .create_data_channel("rt-metrics", None)
        .await
        .map_err(internal)?;
    {
        let tx = state.metrics_tx.clone();
        let dc_for_open = dc.clone();
        let dc_for_msg = dc.clone();

        dc.on_open(Box::new(move || {
            let dc = dc_for_open.clone();
            Box::pin(async move {
                info!("DataChannel 'rt-metrics' abierto (server-side)");
                let mut tick = interval(Duration::from_millis(1000));
                loop {
                    tick.tick().await;
                    let now_ms = now_millis();
                    let payload = format!(r#"{{"kind":"PING","t":{now_ms}}}"#);
                    if let Err(e) = dc.send_text(payload).await {
                        warn!("Error enviando PING: {e:?}");
                        break;
                    }
                }
            })
        }));

        dc.on_message(Box::new(move |msg: DataChannelMessage| {
            let tx = tx.clone();
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

                            let echo = format!(r#"{{"kind":"ECHO","t":{}}}"#, t0);
                            let _ = dc.send_text(echo).await;
                        }
                    }
                }
            })
        }));
    }

    // 4) SDP remoto → set_remote
    pc.set_remote_description(offer_sdp).await.map_err(internal)?;

    // 5) Crear answer
    let answer = pc.create_answer(None).await.map_err(internal)?;

    // ⛏️ **IMPORTANTE**: primero set_local_description (esto dispara ICE gathering)
    pc.set_local_description(answer.clone()).await.map_err(internal)?;

    // 6) Esperar a que termine el ICE gathering del servidor
    let mut gather_rx = pc.gathering_complete_promise().await;
    let _ = gather_rx.recv().await;

    // 7) Tomar el SDP final (con candidates) desde local_description
    let local = pc
        .local_description()
        .await
        .ok_or_else(|| internal("missing local_description"))?;

    info!("📜 Enviando SDP answer (len={} chars)", local.sdp.len());

    Ok(Json(SdpResponse {
        sdp: local.sdp,            // usa el SDP final con candidates
        r#type: "answer".into(),
    }))
}


// ---------- Seguridad ----------

fn validate_origin(headers: &HeaderMap, state: &AppState) -> Result<(), (StatusCode, String)> {
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        let ok = state.allowed_ws_origins.iter().any(|o| o == origin);
        if ok {
            return Ok(());
        }
    }
    Err((StatusCode::FORBIDDEN, "invalid origin".into()))
}

// Igual que en lab-02 pero con perfil de lab-03 (iss/aud)
fn validate_bearer_lab03(headers: &HeaderMap, state: &AppState) -> Result<WsClaims, (StatusCode, String)> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let token = auth
        .strip_prefix("Bearer ")
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer".to_string()))?;

    let lab03_profile = [TokenProfile {
        iss: "lab-03",
        aud: "lab-webrtc-03-metrics",
    }];

    match validate_ws_token_multi(token, &state.ws_secret, &lab03_profile) {
        Ok(claims) => Ok(claims),
        Err(e) => {
            warn!("JWT inválido (lab-03): {e}");
            Err((StatusCode::UNAUTHORIZED, "unauthorized".into()))
        }
    }
}

// ---------- Util ----------

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

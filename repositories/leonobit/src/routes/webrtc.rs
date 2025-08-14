// src/routes/webrtc.rs
use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use axum::extract::ws::{WebSocketUpgrade, WebSocket, Message};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};
use uuid::Uuid;

use crate::auth::{WsClaims, validate_ws_token_multi}; // ⬅️ cambio de import
use super::AppState;

#[derive(Debug, Deserialize)]
pub(crate) struct WsParams { token: String }

#[derive(Debug, Deserialize)]
struct Offer {
    sdp: String,
    #[allow(dead_code)]
    r#type: String,
}

#[derive(Debug, Serialize)]
struct Answer { sdp: String, r#type: String }

pub async fn ws_handler(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
    Query(params): Query<WsParams>,
    headers: HeaderMap,
) -> Response {
    // 1) Validar Origin del upgrade WS (no es CORS)
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        if !state.allowed_ws_origins.is_empty() {
            let ok = state
                .allowed_ws_origins
                .iter()
                .any(|o| o.eq_ignore_ascii_case(origin));
            if !ok {
                warn!("WS origin bloqueado: {}", origin);
                return (StatusCode::FORBIDDEN, "invalid websocket origin").into_response();
            }
        }
    }

    // 2) Validar JWT HS256 contra cualquiera de los perfiles permitidos (iss/aud)
    let claims: WsClaims = match validate_ws_token_multi(
        &params.token,
        &state.ws_secret,
        &state.profiles, // ⬅️ perfiles inyectados en AppState
    ) {
        Ok(c) => c,
        Err(e) => {
            warn!("WS token inválido: {e}");
            return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
        }
    };
    info!("✅ WS autorizado: sub={} role={:?}", claims.sub, claims.role);

    // 3) Upgrade y manejo de socket
    ws.on_upgrade(move |socket| handle_socket(socket, state)).into_response()
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let peer_id = Uuid::new_v4().to_string();
    state.peers.insert(peer_id.clone());
    info!("🔗 Nueva conexión: {}", peer_id);

    let (mut tx, mut rx) = socket.split();

    // Bucle principal
    loop {
        match rx.next().await {
            Some(Ok(Message::Text(t))) => {
                // ⚡️ RTT: eco 1:1 para "PING::<timestamp>"
                if t.starts_with("PING::") {
                    if tx.send(Message::Text(t)).await.is_err() { break; }
                    continue;
                }

                // Señalización “demo”: si viene una oferta JSON, responde answer “simulada”
                if let Ok(offer) = serde_json::from_str::<Offer>(&t) {
                    info!("📩 Oferta SDP de {}: {}", peer_id, offer.sdp);
                    let ans = Answer {
                        sdp: format!("Respuesta SDP simulada para {}", peer_id),
                        r#type: "answer".into(),
                    };
                    if tx.send(Message::Text(serde_json::to_string(&ans).unwrap())).await.is_err() { break; }
                } else {
                    // Eco normal
                    if tx.send(Message::Text(t)).await.is_err() { break; }
                }
            }
            Some(Ok(Message::Binary(b))) => {
                if tx.send(Message::Binary(b)).await.is_err() { break; }
            }
            Some(Ok(Message::Ping(p))) => {
                if tx.send(Message::Pong(p)).await.is_err() { break; }
            }
            Some(Ok(Message::Pong(_))) => { /* noop */ }
            Some(Ok(Message::Close(frame))) => {
                info!("🔻 Close {:?} {}", frame, peer_id);
                break;
            }
            Some(Err(e)) => {
                warn!("⚠️ WS error {}: {:?}", peer_id, e);
                break;
            }
            None => break,
        }
    }

    state.peers.remove(&peer_id);
    info!("❌ Conexión cerrada: {}", peer_id);
}

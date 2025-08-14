// src/routes/labs/lab02.rs
use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use axum::extract::ws::{WebSocketUpgrade, WebSocket, Message};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tracing::warn;
use uuid::Uuid;
use chrono::Utc;

use crate::auth::{WsClaims, validate_ws_token_multi};
use crate::routes::AppState;

#[derive(Debug, Deserialize)]
pub(crate) struct WsParams { token: String }

pub async fn ws_handler(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
    Query(params): Query<WsParams>,
    headers: HeaderMap,
) -> Response {
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        if !state.allowed_ws_origins.is_empty() &&
           !state.allowed_ws_origins.iter().any(|o| o.eq_ignore_ascii_case(origin)) {
            warn!("WS origin bloqueado: {}", origin);
            return (StatusCode::FORBIDDEN, "invalid websocket origin").into_response();
        }
    }

    let claims: WsClaims = match validate_ws_token_multi(
        &params.token, &state.ws_secret, &state.profiles
    ) {
        Ok(c) => c,
        Err(e) => {
            warn!("WS token inválido: {e}");
            return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
        }
    };

    ws.on_upgrade(move |socket| handle_socket(socket, state)).into_response()
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let peer_id = Uuid::new_v4().to_string();
    state.peers.insert(peer_id.clone());

    let (mut tx, mut rx) = socket.split();
    let mut expected_seq: u64 = 0;

    while let Some(Ok(msg)) = rx.next().await {
        match msg {
            Message::Text(t) => {
                // PING::<ts_cli_ms>::<seq>
                if let Some(rest) = t.strip_prefix("PING::") {
                    let mut it = rest.split("::");
                    if let (Some(ts_cli), Some(seq_s)) = (it.next(), it.next()) {
                        let seq = seq_s.parse::<u64>().unwrap_or(0);
                        if expected_seq == 0 { expected_seq = seq; }
                        // (opcional) detectar pérdidas: if seq > expected_seq { /* lost += ... */ }
                        expected_seq = seq + 1;

                        let ts_srv = Utc::now().timestamp_millis();
                        let pong = format!("PONG::{ts_cli}::{seq}::{ts_srv}");
                        if tx.send(Message::Text(pong)).await.is_err() { break; }
                        continue;
                    }
                }

                // fallback: eco
                if tx.send(Message::Text(t)).await.is_err() { break; }
            }
            Message::Ping(p) => { if tx.send(Message::Pong(p)).await.is_err() { break; } }
            Message::Close(_) => break,
            _ => {}
        }
    }

    state.peers.remove(&peer_id);
}

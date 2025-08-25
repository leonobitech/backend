// src/routes/webrtc.rs
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use tracing::{info, warn};

use crate::auth::{validate_ws_token_multi, WsClaims};
use crate::routes::AppState;

fn bearer_from(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(|s| s.trim())
}

#[cfg_attr(debug_assertions, axum::debug_handler)]
pub async fn ws_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    ws: WebSocketUpgrade,
    headers: HeaderMap,
) -> Response {
    // 1) Validar Origin opcional
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        if !state.allowed_ws_origins.is_empty()
            && !state
                .allowed_ws_origins
                .iter()
                .any(|o| o.eq_ignore_ascii_case(origin))
        {
            warn!("WS origin bloqueado: {}", origin);
            return (StatusCode::FORBIDDEN, "invalid websocket origin").into_response();
        }
    }

    // 2) Extraer Bearer Token
    let token = match bearer_from(&headers) {
        Some(t) if !t.is_empty() => t,
        _ => return (StatusCode::UNAUTHORIZED, "missing bearer").into_response(),
    };

    // 3) Validar JWT
    let claims: WsClaims = match validate_ws_token_multi(token, &state.ws_secret, &state.profiles) {
        Ok(c) => c,
        Err(e) => {
            warn!("WS token inválido: {e}");
            return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
        }
    };

    info!(
        "✅ WS autorizado: sub={} role={:?}",
        claims.sub, claims.role
    );

    // 4) Upgrade: responder "connected!" y escuchar hasta cierre
    ws.on_upgrade(move |mut socket: WebSocket| async move {
        // Enviamos mensaje inicial
        if socket
            .send(Message::Text("connected!".into()))
            .await
            .is_ok()
        {
            info!("🔗 Conexión establecida");
        }

        // Bucle mínimo: ignoramos todo y cerramos en error/close
        while let Some(msg) = socket.recv().await {
            match msg {
                Ok(axum::extract::ws::Message::Close(_)) => break,
                Ok(_) => { /* ignorar mensajes */ }
                Err(e) => {
                    warn!("⚠️ WS error: {:?}", e);
                    break;
                }
            }
        }

        info!("❌ Conexión cerrada");
    })
    .into_response()
}

// src/routes/webrtc.rs
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::auth::{validate_ws_token_multi, WsClaims};
use crate::routes::AppState;

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum InMsg {
    Auth {
        token: String,
    },
    #[serde(rename_all = "lowercase")]
    Control {
        op: String,
        #[serde(default)]
        payload: serde_json::Value,
    },
    Ping {
        ts: Option<i64>,
    },
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum OutMsg {
    Ready,
    Pong { ts: Option<i64> },
}

fn origin_allowed(allowed: &[String], origin: Option<&str>) -> bool {
    origin
        .map(|o| allowed.is_empty() || allowed.iter().any(|a| a.eq_ignore_ascii_case(o)))
        .unwrap_or(true)
}

#[cfg_attr(debug_assertions, axum::debug_handler)]
pub async fn ws_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    ws: WebSocketUpgrade,
    headers: HeaderMap,
) -> Response {
    // 1) Origin
    let origin = headers.get("origin").and_then(|v| v.to_str().ok());
    if !origin_allowed(&state.allowed_ws_origins, origin) {
        warn!(origin=?origin, "WS origin bloqueado");
        return (StatusCode::FORBIDDEN, "invalid websocket origin").into_response();
    }

    // ✅ No exigimos Authorization en el handshake: el browser no puede mandarlo.
    ws.on_upgrade(move |socket| ws_loop(state, socket))
        .into_response()
}

async fn ws_loop(state: AppState, mut socket: WebSocket) {
    // Esperar PRIMER MENSAJE: {kind:"auth", token}
    let token = match socket.recv().await {
        Some(Ok(Message::Text(txt))) => match serde_json::from_str::<InMsg>(&txt) {
            Ok(InMsg::Auth { token }) => token,
            _ => {
                let _ = socket.close().await;
                return;
            }
        },
        _ => {
            let _ = socket.close().await;
            return;
        }
    };

    // Validar JWT con perfiles/secret del AppState
    let claims: WsClaims = match validate_ws_token_multi(&token, &state.ws_secret, &state.profiles)
    {
        Ok(c) => c,
        Err(e) => {
            warn!("WS token inválido: {e}");
            let _ = socket.close().await;
            return;
        }
    };
    info!(
        "✅ WS autorizado: sub={} role={:?}",
        claims.sub, claims.role
    );

    // Enviar {kind:"ready"}
    if socket
        .send(Message::Text(
            serde_json::to_string(&OutMsg::Ready).unwrap(),
        ))
        .await
        .is_ok()
    {
        info!("🔗 READY enviado");
    }

    // Loop mínimo: ping/pong, control.goodbye, close
    while let Some(msg) = socket.recv().await {
        match msg {
            Ok(Message::Text(txt)) => {
                match serde_json::from_str::<InMsg>(&txt) {
                    Ok(InMsg::Ping { ts }) => {
                        let _ = socket
                            .send(Message::Text(
                                serde_json::to_string(&OutMsg::Pong { ts }).unwrap(),
                            ))
                            .await;
                    }
                    Ok(InMsg::Control { op, payload }) if op.eq_ignore_ascii_case("goodbye") => {
                        let reason = payload
                            .get("reason")
                            .and_then(|v| v.as_str())
                            .unwrap_or("<sin reason>");
                        info!("👋 control.goodbye recibido (reason={reason})");
                    }
                    _ => { /* ignorar otros por ahora */ }
                }
            }
            Ok(Message::Close(cf)) => {
                let (code, reason) = (
                    cf.as_ref().map(|f| u16::from(f.code)).unwrap_or(1005), // 1005 = No Status Received
                    cf.as_ref().map(|f| f.reason.as_ref()).unwrap_or(""),
                );
                info!("🔚 Close frame recibido (code={code}, reason='{reason}')");
                break;
            }
            Ok(_) => {}
            Err(e) => {
                warn!("⚠️ WS error: {:?}", e);
                break;
            }
        }
    }
    info!("❌ Conexión WS cerrada");
}

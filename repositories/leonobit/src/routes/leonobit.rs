// src/routes/webrtc.rs
use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};
use uuid::Uuid;

use crate::auth::{validate_ws_token_multi, WsClaims};
use crate::routes::AppState;

/* ─────────────── Tipos de protocolo ─────────────── */

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum InMsg {
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
enum OutMsg<'a> {
    Ready,
    Pong { ts: Option<i64> },
    Error { message: &'a str },
}

/* ─────────────── Helpers ─────────────── */

fn bearer_from(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(str::trim)
}

fn origin_allowed(allowed: &[String], origin: Option<&str>) -> bool {
    origin
        .map(|o| allowed.is_empty() || allowed.iter().any(|a| a.eq_ignore_ascii_case(o)))
        .unwrap_or(true)
}

fn validate_token(token: &str, state: &AppState) -> Result<WsClaims, String> {
    validate_ws_token_multi(token, &state.ws_secret, &state.profiles).map_err(|e| e.to_string())
}

enum Ev {
    Goodbye(Option<String>),
    Ping(Option<i64>),
    Close(Option<(u16, String)>),
    Ignore,
    BadJson(String),
}

fn classify(msg: Message) -> Ev {
    match msg {
        Message::Text(raw) => match serde_json::from_str::<InMsg>(&raw) {
            Ok(InMsg::Control { op, payload }) if op.eq_ignore_ascii_case("goodbye") => {
                let reason = payload
                    .get("reason")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                Ev::Goodbye(reason)
            }
            Ok(InMsg::Ping { ts }) => Ev::Ping(ts),
            Ok(_) => Ev::Ignore,
            Err(e) => Ev::BadJson(e.to_string()),
        },
        Message::Close(cf) => {
            let pair = cf.as_ref().map(|CloseFrame { code, reason }| {
                let r = String::from_utf8_lossy(reason.as_bytes()).to_string();
                (u16::from(*code), r)
            });
            Ev::Close(pair)
        }
        _ => Ev::Ignore,
    }
}

async fn send_json<T: serde::Serialize>(ws: &mut WebSocket, v: &T) -> anyhow::Result<()> {
    let s = serde_json::to_string(v)?;
    ws.send(Message::Text(s)).await?;
    Ok(())
}

/* ─────────────── Handler ─────────────── */

#[cfg_attr(debug_assertions, axum::debug_handler)]
pub async fn ws_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    ws: WebSocketUpgrade,
    headers: HeaderMap,
) -> Response {
    // Origin check
    let origin = headers.get("origin").and_then(|v| v.to_str().ok());
    if !origin_allowed(&state.allowed_ws_origins, origin) {
        warn!(origin=?origin, "WS origin bloqueado");
        return (StatusCode::FORBIDDEN, "invalid websocket origin").into_response();
    }

    // Token check
    let token = match bearer_from(&headers) {
        Some(t) if !t.is_empty() => t,
        _ => return (StatusCode::UNAUTHORIZED, "missing bearer").into_response(),
    };

    let claims = match validate_token(token, &state) {
        Ok(c) => c,
        Err(e) => {
            warn!("WS token inválido: {e}");
            return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
        }
    };

    let conn_id = Uuid::new_v4();
    info!(
        "✅ WS autorizado: sub={} role={:?} conn={}",
        claims.sub, claims.role, conn_id
    );

    ws.on_upgrade(move |socket| ws_loop(socket, conn_id))
        .into_response()
}

async fn ws_loop(mut socket: WebSocket, conn_id: Uuid) {
    // Enviar READY
    if send_json(&mut socket, &OutMsg::Ready).await.is_ok() {
        info!(%conn_id, "🔗 READY enviado (conexión establecida)");
    }

    while let Some(res) = socket.recv().await {
        match res {
            Ok(msg) => match classify(msg) {
                Ev::Ping(ts) => {
                    let _ = send_json(&mut socket, &OutMsg::Pong { ts }).await;
                }
                Ev::Goodbye(reason) => {
                    let r = reason.as_deref().unwrap_or("<sin reason>");
                    info!(%conn_id, "👋 control.goodbye recibido (reason={r})");
                }
                Ev::Close(Some((code, reason))) => {
                    info!(%conn_id, code, reason, "🔚 Close frame recibido");
                    break;
                }
                Ev::Close(None) => {
                    info!(%conn_id, "🔚 Close frame recibido (sin detalle)");
                    break;
                }
                Ev::BadJson(err) => {
                    let _ = send_json(&mut socket, &OutMsg::Error { message: &err }).await;
                    warn!(%conn_id, %err, "JSON inválido");
                }
                Ev::Ignore => {}
            },
            Err(e) => {
                warn!(%conn_id, ?e, "⚠️ WS error");
                break;
            }
        }
    }

    info!(%conn_id, "❌ Conexión WS cerrada");
}

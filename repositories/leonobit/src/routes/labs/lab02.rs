// src/routes/labs/lab02.rs
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tracing::{info, warn};
use uuid::Uuid;

use crate::auth::{validate_ws_token_multi, TokenProfile, WsClaims};
use crate::routes::AppState;

#[derive(Debug, Deserialize)]
pub(crate) struct WsParams {
    token: String,
}

pub async fn ws_handler(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
    Query(params): Query<WsParams>,
    headers: HeaderMap,
) -> Response {
    // 1) Validar Origin (upgrade WS != CORS)
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        if !state.allowed_ws_origins.is_empty()
            && !state
                .allowed_ws_origins
                .iter()
                .any(|o| o.eq_ignore_ascii_case(origin))
        {
            warn!("[lab-02] WS origin bloqueado: {}", origin);
            return (StatusCode::FORBIDDEN, "invalid websocket origin").into_response();
        }
    }

    // 2) Validar JWT contra el perfil de lab-02 (aud/iss específicos)
    let lab02_profile = [TokenProfile {
        iss: "lab-02",
        aud: "lab-ws-02-metrics",
    }];

    let claims: WsClaims =
        match validate_ws_token_multi(&params.token, &state.ws_secret, &lab02_profile) {
            Ok(c) => c,
            Err(e) => {
                warn!("[lab-02] token inválido: {e}");
                return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
            }
        };

    info!(
        "✅ [lab-02] autorizado: sub={} role={:?}",
        claims.sub, claims.role
    );

    // 3) Upgrade y manejo del socket
    ws.on_upgrade(move |socket| handle_socket(socket, state)).into_response()
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let peer_id = Uuid::new_v4().to_string();
    state.peers.insert(peer_id.clone());
    info!("🔗 [lab-02] Nueva conexión: {}", &peer_id);

    let (mut tx, mut rx) = socket.split();

    // Seguimiento de pérdidas por secuencia
    let mut expected_seq: Option<u64> = None;
    let mut lost_total: u64 = 0;

    // (Opcional) counters simples en server
    let mut pong_count: u64 = 0;

    while let Some(msg) = rx.next().await {
        match msg {
            Ok(Message::Text(t)) => {
                // Esperamos: PING::<ts_cli_ms>::<seq>  (también soporta PING::<ts_cli_ms>)
                if let Some(rest) = t.strip_prefix("PING::") {
                    let parts: Vec<_> = rest.splitn(3, "::").collect();
                    match parts.as_slice() {
                        // Forma canónica con secuencia
                        [ts_cli_s, seq_s] => {
                            let seq: u64 = match seq_s.parse() {
                                Ok(v) => v,
                                Err(_) => {
                                    warn!("[lab-02:{}] seq inválido en '{}'", peer_id, t);
                                    // eco como fallback
                                    if tx.send(Message::Text(t)).await.is_err() {
                                        break;
                                    }
                                    continue;
                                }
                            };

                            // Pérdidas (si había expectativa)
                            if let Some(exp) = expected_seq {
                                if seq > exp {
                                    let lost_here = seq.saturating_sub(exp);
                                    lost_total = lost_total.saturating_add(lost_here);
                                    warn!(
                                        "[lab-02:{}] pérdida: llegó seq={}, esperado>={}. perdidos_en_salto={}, total={}",
                                        peer_id, seq, exp, lost_here, lost_total
                                    );
                                }
                            }
                            expected_seq = Some(seq + 1);

                            let ts_srv = Utc::now().timestamp_millis();
                            let pong = format!("PONG::{}::{}::{}", ts_cli_s, seq, ts_srv);
                            pong_count += 1;
                            if tx.send(Message::Text(pong)).await.is_err() {
                                break;
                            }
                            continue;
                        }
                        // Forma simple sin seq (usamos seq=0)
                        [ts_cli_s] => {
                            let ts_srv = Utc::now().timestamp_millis();
                            let pong = format!("PONG::{}::{}::{}", ts_cli_s, 0, ts_srv);
                            pong_count += 1;
                            if tx.send(Message::Text(pong)).await.is_err() {
                                break;
                            }
                            continue;
                        }
                        _ => {
                            warn!("[lab-02:{}] formato PING inválido en '{}'", peer_id, t);
                            // eco como fallback
                            if tx.send(Message::Text(t)).await.is_err() {
                                break;
                            }
                            continue;
                        }
                    }
                }

                // Mensaje normal → eco
                if tx.send(Message::Text(t)).await.is_err() {
                    break;
                }
            }

            Ok(Message::Binary(b)) => {
                // eco binario
                if tx.send(Message::Binary(b)).await.is_err() {
                    break;
                }
            }

            Ok(Message::Ping(p)) => {
                // PONG nativo del protocolo (independiente del PING::... de app)
                if tx.send(Message::Pong(p)).await.is_err() {
                    break;
                }
            }

            Ok(Message::Pong(_)) => {
                // noop (podrías actualizar un heartbeat aquí)
            }

            Ok(Message::Close(frame)) => {
                info!("🔻 [lab-02] Close {:?} {}", frame, peer_id);
                break;
            }

            Err(e) => {
                warn!("⚠️ [lab-02] WS error {}: {:?}", peer_id, e);
                break;
            }
        }
    }

    state.peers.remove(&peer_id);
    info!(
        "❌ [lab-02] Conexión cerrada: {} | pérdidas totales: {} | pongs_enviados: {}",
        peer_id, lost_total, pong_count
    );
}

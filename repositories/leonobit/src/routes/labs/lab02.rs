// src/routes/labs/lab02.rs
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
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

#[cfg_attr(debug_assertions, axum::debug_handler)]
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
            warn!("WS origin bloqueado: {}", origin);
            return (StatusCode::FORBIDDEN, "invalid websocket origin").into_response();
        }
    }

    // 2) Validar JWT contra perfil de lab-02 (aud/iss específicos)
    let lab02_profile = [TokenProfile {
        iss: "lab-02",
        aud: "lab-ws-02-metrics",
    }];
    let claims: WsClaims =
        match validate_ws_token_multi(&params.token, &state.ws_secret, &lab02_profile) {
            Ok(c) => c,
            Err(e) => {
                warn!("WS token inválido (lab-02): {e}");
                return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
            }
        };

    info!(
        "✅ [lab-02] autorizado: sub={} role={:?}",
        claims.sub, claims.role
    );

    // 3) Upgrade y manejo del socket
    ws.on_upgrade(move |socket| handle_socket(socket, state))
        .into_response()
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let peer_id = Uuid::new_v4().to_string();
    state.peers.insert(peer_id.clone());
    info!("🔗 [lab-02] Nueva conexión: {}", &peer_id);

    let (mut tx, mut rx) = socket.split();

    // Seguimiento simple de secuencia para detectar pérdidas
    let mut expected_seq: Option<u64> = None;
    let mut lost_total: u64 = 0;

    while let Some(msg) = rx.next().await {
        match msg {
            Ok(Message::Text(t)) => {
                // Formato ping esperado: PING::<ts_cli_ms>::<seq>
                if let Some(rest) = t.strip_prefix("PING::") {
                    // timestamp de recepción en el servidor
                    let ts_srv_recv = Utc::now().timestamp_millis();

                    // separa en máximo 2 “::”
                    let mut it = rest.splitn(3, "::");
                    let ts_cli_s = it.next();
                    let seq_s = it.next();

                    match (ts_cli_s, seq_s) {
                        (Some(ts_cli_s), Some(seq_s)) => {
                            // Parse de secuencia
                            let seq: u64 = match seq_s.parse() {
                                Ok(v) => v,
                                Err(_) => {
                                    warn!("[{}] seq inválido en '{}'", peer_id, t);
                                    // Eco como fallback para que el cliente vea el problema
                                    if tx.send(Message::Text(t)).await.is_err() {
                                        break;
                                    }
                                    continue;
                                }
                            };

                            // Detección de pérdidas (si ya teníamos una expectativa)
                            if let Some(exp) = expected_seq {
                                if seq > exp {
                                    let lost_here = seq.saturating_sub(exp);
                                    lost_total = lost_total.saturating_add(lost_here);
                                    warn!(
                                        "[{}] pérdida detectada: llegó seq={}, esperado >= {} (perdidos en este salto: {}, total: {})",
                                        peer_id, seq, exp, lost_here, lost_total
                                    );
                                }
                            }
                            // Actualizar expectativa para el próximo paquete
                            expected_seq = Some(seq + 1);

                            // timestamp justo antes de enviar el PONG
                            let ts_srv_send = Utc::now().timestamp_millis();
                            // Nuevo formato con 2 timestamps de servidor
                            let pong = format!(
                                "PONG::{}::{}::{}::{}",
                                ts_cli_s, seq, ts_srv_recv, ts_srv_send
                            );
                            if tx.send(Message::Text(pong)).await.is_err() {
                                break;
                            }
                            continue;
                        }
                        _ => {
                            warn!("[{}] formato PING inválido en '{}'", peer_id, t);
                            // Eco como fallback para que el cliente vea el problema
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
                // PONG nativo del protocolo (oculto para el browser, pero correcto en wire)
                if tx.send(Message::Pong(p)).await.is_err() {
                    break;
                }
            }

            Ok(Message::Pong(_)) => {
                // noop
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
        "❌ [lab-02] Conexión cerrada: {} | pérdidas totales detectadas: {}",
        peer_id, lost_total
    );
}

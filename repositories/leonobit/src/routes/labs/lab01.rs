// src/routes/labs/lab01.rs
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
            warn!("[lab-01] WS origin bloqueado: {}", origin);
            return (StatusCode::FORBIDDEN, "invalid websocket origin").into_response();
        }
    }

    // 2) Validar JWT SOLO contra el perfil del lab-01
    let lab01_profile = [TokenProfile {
        iss: "lab-01",
        aud: "lab-ws-01-auth",
    }];
    let claims: WsClaims =
        match validate_ws_token_multi(&params.token, &state.ws_secret, &lab01_profile) {
            Ok(c) => c,
            Err(e) => {
                warn!("[lab-01] WS token inválido: {e}");
                return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
            }
        };

    info!(
        "✅ [lab-01] autorizado: sub={} role={:?}",
        claims.sub, claims.role
    );

    // 3) Upgrade WS
    ws.on_upgrade(move |socket| handle_socket(socket, state))
        .into_response()
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let peer_id = Uuid::new_v4().to_string();
    state.peers.insert(peer_id.clone());
    info!("🔗 [lab-01] Nueva conexión: {}", &peer_id);

    let (mut tx, mut rx) = socket.split();

    // Seguimiento (solo se usa cuando hay 'seq')
    let mut expected_seq: Option<u64> = None;
    let mut lost_total: u64 = 0;

    while let Some(msg) = rx.next().await {
        match msg {
            Ok(Message::Text(t)) => {
                // Soportar ambos formatos:
                //  - PING::<ts_cli>                  -> eco (compat. con lab-01 original)
                //  - PING::<ts_cli>::<seq>           -> PONG::<ts_cli>::<seq>::<ts_srv>
                if let Some(rest) = t.strip_prefix("PING::") {
                    // Separamos hasta 3 componentes como máximo
                    let mut it = rest.splitn(3, "::");
                    let ts_cli_opt = it.next();
                    let seq_opt = it.next();

                    match (ts_cli_opt, seq_opt) {
                        // Caso 1: formato nuevo con seq → responder PONG enriquecido
                        (Some(ts_cli_s), Some(seq_s)) if !seq_s.is_empty() => {
                            // Parse 'seq' y pérdidas
                            let seq: u64 = match seq_s.parse() {
                                Ok(v) => v,
                                Err(_) => {
                                    warn!("[lab-01][{}] seq inválido en '{}'", peer_id, t);
                                    // No ensuciamos: eco y seguimos
                                    if tx.send(Message::Text(t)).await.is_err() { break; }
                                    continue;
                                }
                            };

                            if let Some(exp) = expected_seq {
                                if seq > exp {
                                    let lost_here = seq.saturating_sub(exp);
                                    lost_total = lost_total.saturating_add(lost_here);
                                    warn!(
                                        "[lab-01][{}] pérdida detectada: llegó seq={}, esperado >= {} (perdidos+={} total={})",
                                        peer_id, seq, exp, lost_here, lost_total
                                    );
                                }
                            }
                            expected_seq = Some(seq + 1);

                            let ts_srv = Utc::now().timestamp_millis();
                            let pong = format!("PONG::{}::{}::{}", ts_cli_s, seq, ts_srv);
                            if tx.send(Message::Text(pong)).await.is_err() { break; }
                            continue;
                        }

                        // Caso 2: formato simple sin seq → eco 1:1 (RTT lado cliente)
                        (Some(_ts_cli_s), _) => {
                            // No es error: es el modo “simple” del lab-01
                            if tx.send(Message::Text(t)).await.is_err() { break; }
                            continue;
                        }

                        _ => {
                            // Si no hay ni siquiera ts_cli, ahí sí avisamos
                            warn!("[lab-01][{}] PING sin timestamp en '{}'", peer_id, t);
                            if tx.send(Message::Text(t)).await.is_err() { break; }
                            continue;
                        }
                    }
                }

                // Mensaje normal → eco
                if tx.send(Message::Text(t)).await.is_err() { break; }
            }

            Ok(Message::Binary(b)) => {
                // eco binario
                if tx.send(Message::Binary(b)).await.is_err() { break; }
            }

            Ok(Message::Ping(p)) => {
                // PONG nativo del protocolo
                if tx.send(Message::Pong(p)).await.is_err() { break; }
            }

            Ok(Message::Pong(_)) => {
                // noop
            }

            Ok(Message::Close(frame)) => {
                info!("🔻 [lab-01] Close {:?} {}", frame, peer_id);
                break;
            }

            Err(e) => {
                warn!("⚠️ [lab-01] WS error {}: {:?}", peer_id, e);
                break;
            }
        }
    }

    state.peers.remove(&peer_id);
    info!(
        "❌ [lab-01] Conexión cerrada: {} | pérdidas totales detectadas (solo cuando hubo seq): {}",
        peer_id, lost_total
    );
}

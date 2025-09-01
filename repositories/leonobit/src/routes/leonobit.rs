use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use futures_util::{SinkExt, StreamExt}; // <- importante: split + send/next
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};
use tracing::{debug, info, warn};

use crate::auth::{validate_ws_token_multi, WsClaims};
use crate::core::webrtc::session::{SigOut, WebRtcSession};
use crate::routes::AppState;

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum InMsg {
  Auth {
    token: String,
  },

  // control & ping
  #[serde(rename_all = "lowercase")]
  Control {
    op: String,
    #[serde(default)]
    payload: serde_json::Value,
  },
  Ping {
    ts: Option<i64>,
  },

  // señalización WebRTC entrante
  #[serde(rename = "webrtc.offer")]
  WebrtcOffer {
    sdp: String,
  },
  #[serde(rename = "webrtc.candidate")]
  WebrtcCandidate {
    candidate: webrtc::ice_transport::ice_candidate::RTCIceCandidateInit,
  },
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum OutMsg {
  Ready,
  Pong {
    ts: Option<i64>,
  },

  // señalización WebRTC saliente
  #[serde(rename = "webrtc.answer")]
  WebrtcAnswer {
    sdp: String,
  },
  #[serde(rename = "webrtc.candidate")]
  WebrtcCandidate {
    candidate: webrtc::ice_transport::ice_candidate::RTCIceCandidateInit,
  },
  // opcional: podrías agregar Error/Notice
  #[serde(rename = "error")]
  Error {
    message: String,
  },
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
  let origin = headers.get("origin").and_then(|v| v.to_str().ok());
  if !origin_allowed(&state.allowed_ws_origins, origin) {
    warn!(origin=?origin, "WS origin bloqueado");
    return (StatusCode::FORBIDDEN, "invalid websocket origin").into_response();
  }

  ws.on_upgrade(move |socket| ws_loop(state, socket)).into_response()
}

async fn ws_loop(state: AppState, socket: WebSocket) {
  // 0) Split: no volvemos a usar `socket` directamente
  let (mut ws_tx, mut ws_rx) = socket.split();

  // 1) Canal para el writer: ÚNICO lugar donde escribimos al socket
  let (out_tx, mut out_rx) = mpsc::unbounded_channel::<OutMsg>();

  // 2) Writer task: drena `out_rx` y manda al WS
  let writer = tokio::spawn(async move {
    while let Some(msg) = out_rx.recv().await {
      let Ok(txt) = serde_json::to_string(&msg) else { continue };
      if ws_tx.send(Message::Text(txt)).await.is_err() {
        break; // socket cerrado
      }
      // Log de salidas WS (útil para ver answer/candidates)
      let Ok(txt) = serde_json::to_string(&msg) else { continue };
      let size = txt.len();
      match &msg {
        OutMsg::WebrtcAnswer { .. } => debug!("[ws] → webrtc.answer ({} bytes JSON)", size),
        OutMsg::WebrtcCandidate { .. } => debug!("[ws] → webrtc.candidate ({} bytes JSON)", size),
        OutMsg::Pong { .. } => debug!("[ws] → pong ({} bytes JSON)", size),
        OutMsg::Ready => debug!("[ws] → ready ({} bytes JSON)", size),
        OutMsg::Error { message } => warn!("[ws] → error: {}", message),
      }
    }
    // opcional: enviar Close
    // let _ = ws_tx.send(Message::Close(None)).await;
  });

  // 3) Esperar AUTH del cliente con timeout (Evita sockets colgados si el cliente nunca manda Auth.)
  let token = match timeout(Duration::from_secs(5), ws_rx.next()).await {
    Ok(Some(Ok(Message::Text(txt)))) => match serde_json::from_str::<InMsg>(&txt) {
      Ok(InMsg::Auth { token }) => token,
      _ => {
        warn!("[ws] primer mensaje no es auth");
        let _ = out_tx.send(OutMsg::Error {
          message: "auth required".into(),
        });
        return;
      }
    },
    _ => {
      warn!("[ws] auth timeout");
      let _ = out_tx.send(OutMsg::Error {
        message: "auth timeout".into(),
      });
      return;
    }
  };

  // 4) Validar JWT
  let claims: WsClaims = match validate_ws_token_multi(&token, &state.ws_secret, &state.profiles) {
    Ok(c) => c,
    Err(e) => {
      warn!("WS token inválido: {e}");
      let _ = out_tx.send(OutMsg::Error {
        message: "invalid token".into(),
      });
      return;
    }
  };
  info!("✅ WS autorizado: sub={} role={:?}", claims.sub, claims.role);

  // 5) Canal de eventos del core/WebRTC → los convertimos a OutMsg y van al writer
  let (sig_tx, mut sig_rx) = mpsc::unbounded_channel::<SigOut>();

  // 6) Instanciar sesión WebRTC
  let session = match WebRtcSession::new(sig_tx.clone()).await {
    Ok(s) => s,
    Err(e) => {
      warn!("No se pudo crear WebRTC session: {e:?}");
      let _ = out_tx.send(OutMsg::Error {
        message: "failed to create PC".into(),
      });
      return;
    }
  };

  // 7) Forwarder: SigOut -> OutMsg -> out_tx
  let out_tx_clone = out_tx.clone();
  let forwarder = tokio::spawn(async move {
    while let Some(ev) = sig_rx.recv().await {
      match ev {
        SigOut::WebrtcAnswer { sdp } => {
          debug!("[ws] ← core: answer (len={})", sdp.len());
          let _ = out_tx_clone.send(OutMsg::WebrtcAnswer { sdp });
        }
        SigOut::WebrtcCandidate { candidate } => {
          debug!(
            "[ws] ← core: candidate (mid={:?} mline={:?})",
            candidate.sdp_mid, candidate.sdp_mline_index
          );
          let _ = out_tx_clone.send(OutMsg::WebrtcCandidate { candidate });
        }
      }
    }
  });

  // 8) READY
  let _ = out_tx.send(OutMsg::Ready);

  // Loop de lectura
  while let Some(res) = ws_rx.next().await {
    match res {
      Ok(Message::Text(txt)) => {
        match serde_json::from_str::<InMsg>(&txt) {
          Ok(InMsg::Ping { ts }) => {
            debug!("[ws] ping");
            let _ = out_tx.send(OutMsg::Pong { ts });
          }
          Ok(InMsg::Control { op, payload }) if op.eq_ignore_ascii_case("goodbye") => {
            let reason = payload.get("reason").and_then(|v| v.as_str()).unwrap_or("<sin reason>");
            info!("👋 control.goodbye recibido (reason={reason})");
            break;
          }
          Ok(InMsg::WebrtcOffer { sdp }) => {
            info!("[ws] offer recibida (len={})", sdp.len());
            match session.apply_offer_and_create_answer(sdp).await {
              Ok(answer_sdp) => {
                info!("[ws] answer generada (len={})", answer_sdp.len());
                let _ = out_tx.send(OutMsg::WebrtcAnswer { sdp: answer_sdp });
              }
              Err(e) => {
                warn!("apply_offer_and_create_answer error: {e:?}");
                let _ = out_tx.send(OutMsg::Error {
                  message: "invalid offer".into(),
                });
              }
            }
          }
          Ok(InMsg::WebrtcCandidate { candidate }) => {
            debug!(
              "[ws] candidate remoto (mid={:?} mline={:?} len={})",
              candidate.sdp_mid,
              candidate.sdp_mline_index,
              candidate.candidate.len()
            );
            if let Err(e) = session.add_remote_ice(candidate).await {
              warn!("add_remote_ice error: {e:?}");
            }
          }

          _ => { /* ignorar otros */ }
        }
      }
      Ok(Message::Close(_)) => break,
      Ok(_) => {}
      Err(e) => {
        warn!("⚠️ WS recv error: {e:?}");
        break;
      }
    }
  }

  session.close().await;
  drop(out_tx);
  let _ = writer.await;
  forwarder.abort();
  info!("❌ Conexión WS cerrada");
}

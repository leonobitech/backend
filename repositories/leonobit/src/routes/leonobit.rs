// handlers WebSocket para Leonobit (WebRTC + STT con Whisper)
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};
use tracing::{debug, info, warn};

use crate::auth::validate_ws_token_multi;
use crate::core::audio::stt::SttMsg;
use crate::core::audio::whisper_worker::run_whisper_worker;
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

  // errores
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
  // 0) Split
  let (mut ws_tx, mut ws_rx) = socket.split();

  // 1) Canal de salida WS (bounded)
  let (out_tx, mut out_rx) = mpsc::channel::<OutMsg>(64);

  // 2) Writer
  let writer = tokio::spawn(async move {
    while let Some(msg) = out_rx.recv().await {
      if let Ok(txt) = serde_json::to_string(&msg) {
        tracing::debug!("[ws] → {}", txt);
        let size = txt.len();
        if ws_tx.send(Message::Text(txt)).await.is_err() {
          break;
        }
        match &msg {
          OutMsg::WebrtcAnswer { .. } => debug!("[ws] → webrtc.answer ({} bytes JSON)", size),
          OutMsg::WebrtcCandidate { .. } => debug!("[ws] → webrtc.candidate ({} bytes JSON)", size),
          OutMsg::Pong { .. } => debug!("[ws] → pong ({} bytes JSON)", size),
          OutMsg::Ready => debug!("[ws] → ready ({} bytes JSON)", size),
          OutMsg::Error { message } => warn!("[ws] → error: {}", message),
        }
      }
    }
  });

  // 3) Esperar AUTH
  let token = match timeout(Duration::from_secs(5), ws_rx.next()).await {
    Ok(Some(Ok(Message::Text(txt)))) => match serde_json::from_str::<InMsg>(&txt) {
      Ok(InMsg::Auth { token }) => token,
      _ => {
        warn!("[ws] primer mensaje no es auth");
        let _ = out_tx.try_send(OutMsg::Error {
          message: "auth required".into(),
        });
        return;
      }
    },
    _ => {
      warn!("[ws] auth timeout");
      let _ = out_tx.try_send(OutMsg::Error {
        message: "auth timeout".into(),
      });
      return;
    }
  };

  // 4) Validar JWT
  let claims: crate::auth::WsClaims = match validate_ws_token_multi(&token, &state.ws_secret, &state.profiles) {
    Ok(c) => c,
    Err(e) => {
      warn!("WS token inválido: {e}");
      let _ = out_tx.try_send(OutMsg::Error {
        message: "invalid token".into(),
      });
      return;
    }
  };
  info!("✅ WS autorizado: sub={} role={:?}", claims.sub, claims.role);

  // 5) canales: señalización WebRTC, audio Opus hacia worker y texto saliente
  let (sig_tx, sig_rx) = mpsc::unbounded_channel::<SigOut>();
  let (opus_tx, opus_rx) = mpsc::channel::<Vec<u8>>(48);
  let (stt_tx, mut stt_rx) = mpsc::unbounded_channel::<SttMsg>();

  // 6) Contexto de Whisper desde AppState
  let whisper_ctx = state.whisper_ctx.clone();

  // 7) Spawnear el worker de Whisper (lee Opus, decodifica, resamplea y transcribe)
  tokio::spawn(async move {
    if let Err(e) = run_whisper_worker(opus_rx, stt_tx, whisper_ctx).await {
      tracing::error!("whisper worker error: {e:#}");
    }
  });

  // 8) Crear la sesión WebRTC inyectando audio (`opus_tx`) hacia el worker
  let session = match WebRtcSession::new(sig_tx.clone(), opus_tx).await {
    Ok(s) => s,
    Err(e) => {
      tracing::error!("no se pudo crear WebRtcSession: {e:#}");
      let _ = out_tx.try_send(OutMsg::Error {
        message: "webrtc init error".into(),
      });
      return;
    }
  };

  // 9) Forwarder core→WS (solo señalización)
  let out_tx_for_sig = out_tx.clone();
  let forwarder = tokio::spawn(async move {
    let mut sig_rx = sig_rx; // mover al task
    while let Some(ev) = sig_rx.recv().await {
      match ev {
        SigOut::WebrtcAnswer { sdp } => {
          debug!("[ws] ← core: answer (len={})", sdp.len());
          let _ = out_tx_for_sig.send(OutMsg::WebrtcAnswer { sdp }).await;
        }
        SigOut::WebrtcCandidate { candidate } => {
          debug!(
            "[ws] ← core: candidate (mid={:?} mline={:?})",
            candidate.sdp_mid, candidate.sdp_mline_index
          );
          let _ = out_tx_for_sig.send(OutMsg::WebrtcCandidate { candidate }).await;
        }
      }
    }
  });

  // 10) Consumo de transcripciones del worker → DataChannel chat (SOLO DataChannel, NO WebSocket)
  let session_for_stt = session.clone();
  tokio::spawn(async move {
    while let Some(msg) = stt_rx.recv().await {
      match msg {
        SttMsg::Partial { text } => {
          // Esperar hasta 5s a que DataChannel esté disponible
          let mut retry_count = 0;
          let max_retries = 50; // 50 * 100ms = 5s
          loop {
            let t0 = std::time::Instant::now();
            let payload = serde_json::json!({
              "kind": "stt.partial",
              "text": text
            });
            if let Ok(json_str) = serde_json::to_string(&payload) {
              match session_for_stt.send_chat(json_str).await {
                Ok(_) => {
                  let dt = t0.elapsed();
                  tracing::info!("⚡ [dc:chat] → stt.partial ({:.2}ms, retries={}): '{}'", dt.as_secs_f64() * 1000.0, retry_count, text);
                  break;
                }
                Err(e) => {
                  if retry_count < max_retries {
                    retry_count += 1;
                    tracing::debug!("⏳ DataChannel no disponible aún (retry {}/{}), esperando...", retry_count, max_retries);
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                  } else {
                    tracing::warn!("⚠️ No se pudo enviar stt.partial por DataChannel después de {} intentos: {e:#}", max_retries);
                    break;
                  }
                }
              }
            }
          }
        }
        SttMsg::Final { text } => {
          // Para Final, también intentar con reintentos
          let mut retry_count = 0;
          let max_retries = 50;
          loop {
            let t0 = std::time::Instant::now();
            let payload = serde_json::json!({
              "kind": "stt.final",
              "text": text
            });
            if let Ok(json_str) = serde_json::to_string(&payload) {
              match session_for_stt.send_chat(json_str).await {
                Ok(_) => {
                  let dt = t0.elapsed();
                  tracing::info!("✅ [dc:chat] → stt.final ({:.2}ms, retries={}): '{}'", dt.as_secs_f64() * 1000.0, retry_count, text);
                  break;
                }
                Err(e) => {
                  if retry_count < max_retries {
                    retry_count += 1;
                    tracing::debug!("⏳ DataChannel no disponible aún (retry {}/{}), esperando...", retry_count, max_retries);
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                  } else {
                    tracing::warn!("⚠️ No se pudo enviar stt.final por DataChannel después de {} intentos: {e:#}", max_retries);
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  // 11) READY
  let _ = out_tx.try_send(OutMsg::Ready);

  // 12) Loop lectura WS
  while let Some(res) = ws_rx.next().await {
    match res {
      Ok(Message::Text(txt)) => match serde_json::from_str::<InMsg>(&txt) {
        Ok(InMsg::Ping { ts }) => {
          debug!("[ws] ping");
          let _ = out_tx.try_send(OutMsg::Pong { ts });
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
              let _ = out_tx.send(OutMsg::WebrtcAnswer { sdp: answer_sdp }).await;
            }
            Err(e) => {
              warn!("apply_offer_and_create_answer error: {e:?}");
              let _ = out_tx.try_send(OutMsg::Error {
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
        _ => {}
      },
      Ok(Message::Close(_)) => break,
      Ok(_) => {}
      Err(e) => {
        warn!("⚠️ WS recv error: {e:?}");
        break;
      }
    }
  }

  // Cierre ordenado
  session.close().await;
  drop(out_tx);
  let _ = writer.await;
  forwarder.abort();
  info!("❌ Conexión WS cerrada");
}

/*
El handler (leonobit.rs) crea los canales, toma el path del modelo desde AppState,
spawnea run_whisper_worker(...) y pasa el opus_tx a WebRtcSession::new(...).
WebRtcSession recibe ese opus_tx y en on_track empuja los payloads Opus al worker.
*/

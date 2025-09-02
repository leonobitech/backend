use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use serde::Serialize;
use tokio::sync::{mpsc, Mutex};
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::RTCDataChannel;
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_codec::RTPCodecType;
use webrtc::rtp_transceiver::rtp_transceiver_direction::RTCRtpTransceiverDirection;
use webrtc::rtp_transceiver::RTCRtpTransceiverInit;

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum SigOut {
  #[serde(rename = "webrtc.answer")]
  WebrtcAnswer { sdp: String },
  #[serde(rename = "webrtc.candidate")]
  WebrtcCandidate { candidate: RTCIceCandidateInit },
}

pub struct WebRtcSession {
  pc: RTCPeerConnection,
  closing: Arc<AtomicBool>,
  // 🔹 Lista de data channels activos (creados por el cliente)
  dcs: Arc<Mutex<Vec<Arc<RTCDataChannel>>>>,
}

impl WebRtcSession {
  pub async fn new(to_ws: mpsc::UnboundedSender<SigOut>) -> Result<Self> {
    // 1) Codecs (incluye Opus)
    let mut me = MediaEngine::default();
    me.register_default_codecs()?;
    let api = APIBuilder::new().with_media_engine(me).build();

    // 2) STUN-only
    let cfg = RTCConfiguration {
      ice_servers: vec![RTCIceServer {
        urls: vec![
          "stun:stun.l.google.com:19302".to_string(),
          "stun:stun.cloudflare.com:3478".to_string(),
        ],
        ..Default::default()
      }],
      ..Default::default()
    };

    // 3) PeerConnection
    let pc = api.new_peer_connection(cfg).await?;
    let closing = Arc::new(AtomicBool::new(false));
    let dcs: Arc<Mutex<Vec<Arc<RTCDataChannel>>>> = Arc::new(Mutex::new(Vec::new()));

    // 4) AUDIO sendrecv
    pc.add_transceiver_from_kind(
      RTPCodecType::Audio,
      Some(RTCRtpTransceiverInit {
        direction: RTCRtpTransceiverDirection::Sendrecv,
        send_encodings: vec![],
      }),
    )
    .await?;

    // ===== Logs de estado (sin cambios) =====
    pc.on_peer_connection_state_change(Box::new(|s| {
      Box::pin(async move { tracing::info!("[pc] state = {:?}", s) })
    }));
    pc.on_ice_connection_state_change(Box::new(|s| {
      Box::pin(async move { tracing::info!("[pc] ICE conn = {:?}", s) })
    }));
    pc.on_ice_gathering_state_change(Box::new(|s| {
      Box::pin(async move {
        tracing::info!("[pc] ICE gathering = {:?}", s);
        if format!("{:?}", s).eq("Complete") {
          tracing::info!("[pc] ICE gathering state = Complete");
        }
      })
    }));

    // ===== Contador y reenvío de ICE (trickle) =====
    let cand_count = Arc::new(AtomicUsize::new(0));
    {
      let tx = to_ws.clone();
      let cand_count = Arc::clone(&cand_count);
      let closing_flag = Arc::clone(&closing);
      pc.on_ice_candidate(Box::new(move |c_opt| {
        let tx = tx.clone();
        let cand_count = Arc::clone(&cand_count);
        let closing_flag = Arc::clone(&closing_flag);
        Box::pin(async move {
          if closing_flag.load(Ordering::Relaxed) {
            return;
          }
          if let Some(c) = c_opt {
            if let Ok(init) = c.to_json() {
              let n = cand_count.fetch_add(1, Ordering::Relaxed) + 1;
              tracing::info!("[pc] ICE candidate #{n} => enviado al cliente");
              let _ = tx.send(SigOut::WebrtcCandidate { candidate: init });
            }
          }
        })
      }));
    }

    // ===== DataChannels creados por el cliente =====
    {
      let dcs_list = Arc::clone(&dcs);
      pc.on_data_channel(Box::new(move |dc| {
        let label = dc.label().to_string();
        tracing::info!("on_data_channel: {label}");

        // Guardamos la referencia para poder cerrarlo luego
        {
          let dc_clone = dc.clone();
          let dcs_list = Arc::clone(&dcs_list);
          // No es async, pero el lock es muy corto (push); está bien usar Mutex aquí.
          // Si preferís, podés convertir esto a un pequeño spawn(async move { ... }) con tokio::sync::Mutex.
          tokio::spawn(async move {
            dcs_list.lock().await.push(dc_clone);
          });
        }

        Box::pin(async move {
          // on_open
          let dc_open = dc.clone();
          dc.on_open(Box::new(move || {
            tracing::info!("dc {} open", dc_open.label());
            Box::pin(async {})
          }));

          // on_close
          let dc_close = dc.clone();
          dc.on_close(Box::new(move || {
            tracing::info!("dc {} close", dc_close.label());
            Box::pin(async {})
          }));

          // on_message
          if label == "ctrl" {
            let ctrl_outer = dc.clone();
            dc.on_message(Box::new(move |msg| {
              let ctrl = ctrl_outer.clone();
              Box::pin(async move {
                if let Ok(txt) = std::str::from_utf8(&msg.data) {
                  if let Some(ts) = txt.strip_prefix("ping:") {
                    let _ = ctrl.send_text(format!("pong:{ts}")).await;
                  }
                }
              })
            }));
          } else {
            let dc_other = dc.clone();
            dc.on_message(Box::new(move |_msg| {
              let _ = &dc_other;
              Box::pin(async {})
            }));
          }
        })
      }));
    }

    // ===== Track remoto (audio del cliente) =====
    pc.on_track(Box::new(|track, _rx, _trx| {
      tracing::info!("on_track kind={:?}", track.kind());
      Box::pin(async move {
        // Fase 1 (luego): leer RTP/Opus → decodificar → PCM → Whisper
      })
    }));

    Ok(Self { pc, closing, dcs })
  }

  pub async fn apply_offer_and_create_answer(&self, offer_sdp: String) -> Result<String> {
    tracing::info!("[pc] offer recibida (len={})", offer_sdp.len());
    let offer = RTCSessionDescription::offer(offer_sdp).context("wrap offer SDP into RTCSessionDescription")?;

    self
      .pc
      .set_remote_description(offer)
      .await
      .context("set_remote_description(offer)")?;

    let answer = self.pc.create_answer(None).await.context("create_answer")?;
    self
      .pc
      .set_local_description(answer)
      .await
      .context("set_local_description(answer)")?;

    // Esperar fin de gathering para tener candidates en SDP local
    let mut done = self.pc.gathering_complete_promise().await;
    let _ = done.recv().await;
    tracing::info!("[pc] ICE gathering state = Complete");

    let local = self
      .pc
      .local_description()
      .await
      .context("local_description() returned None")?;
    tracing::info!("[pc] answer generada (len={})", local.sdp.len());
    Ok(local.sdp)
  }

  pub async fn add_remote_ice(&self, cand: RTCIceCandidateInit) -> Result<()> {
    let size = cand.candidate.len();
    tracing::info!(
      "[pc] ICE remoto recibido (mid={:?} mline={:?} len={size})",
      cand.sdp_mid,
      cand.sdp_mline_index
    );
    self.pc.add_ice_candidate(cand).await.context("add_ice_candidate")?;
    Ok(())
  }

  /// Cierre ordenado (silencia callbacks, detiene media, cierra DCs y drena SCTP)
  pub async fn close(&self) {
    // 1) bandera de cierre → evita emitir cosas en callbacks
    self.closing.store(true, Ordering::Relaxed);

    // 2) silenciar callbacks (evita ruido extra)
    self.pc.on_ice_candidate(Box::new(|_| Box::pin(async {})));
    self.pc.on_data_channel(Box::new(|_| Box::pin(async {})));
    self.pc.on_track(Box::new(|_, _, _| Box::pin(async {})));
    self.pc.on_ice_gathering_state_change(Box::new(|_| Box::pin(async {})));
    self.pc.on_ice_connection_state_change(Box::new(|_| Box::pin(async {})));
    self
      .pc
      .on_peer_connection_state_change(Box::new(|_| Box::pin(async {})));

    // 3) cerrar DataChannels explícitamente
    {
      let mut to_close = Vec::new();
      {
        let mut guard = self.dcs.lock().await;
        // Tomamos las refs y vaciamos la lista
        to_close.append(&mut *guard);
      }
      for dc in to_close {
        let _ = dc.close().await;
      }
    }

    // 4) detener envíos de media
    for s in self.pc.get_senders().await {
      let _ = s.replace_track(None).await;
    }
    for t in self.pc.get_transceivers().await {
      let _ = t.stop().await;
    }

    // 5) pequeño “drain” de SCTP para que no aparezca ErrChunk
    tokio::time::sleep(std::time::Duration::from_millis(80)).await;

    // 6) cerrar PC
    let _ = self.pc.close().await;
    tracing::info!("[pc] closed()");
  }
}

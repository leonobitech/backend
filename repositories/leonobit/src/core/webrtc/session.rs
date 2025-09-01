use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};
use serde::Serialize;
use tokio::sync::mpsc;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
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
}

impl WebRtcSession {
  pub async fn new(to_ws: mpsc::UnboundedSender<SigOut>) -> Result<Self> {
    let mut me = MediaEngine::default();
    me.register_default_codecs()?;
    let api = APIBuilder::new().with_media_engine(me).build();

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

    let pc = api.new_peer_connection(cfg).await?;

    // AUDIO sendrecv
    pc.add_transceiver_from_kind(
      RTPCodecType::Audio,
      Some(RTCRtpTransceiverInit {
        direction: RTCRtpTransceiverDirection::Sendrecv,
        send_encodings: vec![],
      }),
    )
    .await?;

    // ===== Handlers de estado / ICE =====
    pc.on_peer_connection_state_change(Box::new(|s| {
      Box::pin(async move {
        tracing::info!("[pc] state = {:?}", s);
      })
    }));

    pc.on_ice_connection_state_change(Box::new(|s| {
      Box::pin(async move {
        tracing::info!("[pc] ICE conn = {:?}", s);
      })
    }));

    pc.on_ice_gathering_state_change(Box::new(|s| {
      Box::pin(async move {
        tracing::info!("[pc] ICE gathering = {:?}", s);
      })
    }));

    // Contador simple de candidates (para log)
    let cand_count = Arc::new(AtomicUsize::new(0));

    // Trickle ICE → reenviar al WS (y loggear)
    {
      let tx = to_ws.clone();
      let cand_count = Arc::clone(&cand_count);
      pc.on_ice_candidate(Box::new(move |c_opt| {
        let tx = tx.clone();
        let cand_count = Arc::clone(&cand_count);
        Box::pin(async move {
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

    // (Opcional) DataChannels creados por el cliente
    pc.on_data_channel(Box::new(|dc| {
      let label = dc.label().to_string();
      tracing::info!("on_data_channel: {}", label);
      Box::pin(async move {
        let dc_for_open = dc.clone();
        dc.on_open(Box::new(move || {
          tracing::info!("dc {} open", dc_for_open.label());
          Box::pin(async {})
        }));

        let _dc_for_msg = dc.clone();
        dc.on_message(Box::new(move |_msg| {
          // tracing::info!("dc msg: {} bytes", _msg.data.len());
          Box::pin(async {})
        }));
      })
    }));

    // (Opcional) Tracks remotos (audio del mic del cliente)
    pc.on_track(Box::new(|track, _rx, _trx| {
      tracing::info!("on_track kind={:?}", track.kind());
      Box::pin(async move {})
    }));

    Ok(Self { pc })
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
    let answer_len = answer.sdp.len();
    self
      .pc
      .set_local_description(answer)
      .await
      .context("set_local_description(answer)")?;

    // Esperar a que termine el gathering (para que la SDP local incluya ICE)
    let mut done = self.pc.gathering_complete_promise().await;
    done.recv().await;
    tracing::info!("[pc] ICE gathering state = Complete");

    let local = self
      .pc
      .local_description()
      .await
      .context("local_description() returned None")?;
    tracing::info!("[pc] answer generada (len={})", answer_len);
    Ok(local.sdp)
  }

  pub async fn add_remote_ice(&self, cand: RTCIceCandidateInit) -> Result<()> {
    // log útil: tamaño de la línea candidate y sdpMLineIndex/MID
    let size = cand.candidate.len();
    tracing::info!(
      "[pc] ICE remoto recibido (mid={:?} mline={:?} len={size})",
      cand.sdp_mid,
      cand.sdp_mline_index
    );
    self.pc.add_ice_candidate(cand).await.context("add_ice_candidate")?;
    Ok(())
  }

  pub async fn close(&self) {
    let _ = self.pc.close().await;
  }
}

// core/webrtc/transceiver.rs
use std::sync::Arc;

use anyhow::Result;
use webrtc::data_channel::data_channel_init::RTCDataChannelInit;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::rtp_transceiver::rtp_transceiver_direction::RTCRtpTransceiverDirection;

pub async fn configure_pc(pc: &Arc<RTCPeerConnection>, dir: RTCRtpTransceiverDirection) -> Result<()> {
  // Audio transceiver (preferir Opus 48k)
  {
    let _ = pc
      .add_transceiver_from_kind(
        webrtc::rtp_transceiver::rtp_codec::RTPCodecType::Audio,
        &webrtc::rtp_transceiver::rtp_transceiver_init::RTCRtpTransceiverInit {
          direction: dir,
          ..Default::default()
        },
      )
      .await?;

    // En webrtc-rs la preferencia de códecs puede requerir setear SDP munging
    // o escoger capabilities. Aquí un ‘hint’ de Opus:
    let _opus = RTCRtpCodecCapability {
      mime_type: "audio/opus".into(),
      clock_rate: 48000,
      channels: 2,
      sdp_fmtp_line: "".into(),
      rtcp_feedback: vec![],
    };
    // Nota: si necesitás forzar orden, usar set_codec_preferences() cuando esté disponible para transceiver.
  }

  // DataChannels: ctrl, chat, binary
  let reliable = Some(RTCDataChannelInit {
    ordered: Some(true),
    ..Default::default()
  });
  let unordered = Some(RTCDataChannelInit {
    ordered: Some(false),
    max_retransmits: Some(0),
    ..Default::default()
  });

  let dc_ctrl = pc.create_data_channel("ctrl", reliable.clone()).await?;
  let dc_chat = pc.create_data_channel("chat", reliable).await?;
  let dc_bin = pc.create_data_channel("binary", unordered).await?;

  // (Opcional) handlers on_open/on_message
  dc_ctrl
    .on_open(Box::new(|| Box::pin(async { tracing::info!("DC ctrl open") })))
    .await;
  dc_chat
    .on_open(Box::new(|| Box::pin(async { tracing::info!("DC chat open") })))
    .await;
  dc_bin
    .on_open(Box::new(|| Box::pin(async { tracing::info!("DC bin  open") })))
    .await;

  Ok(())
}

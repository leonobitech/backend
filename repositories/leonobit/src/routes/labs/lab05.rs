#![allow(dead_code)]
#![allow(unused_imports)]
//! Lab 05 — WebRTC Audio (loopback base + DataChannel "chat")
//!
//! Etapa 0 objetivo:
//! - Mantener el **loopback de audio** idéntico a Lab-04 (camino feliz ya probado).
//! - Agregar un **DataChannel "chat"** (bus de control) sin interferir con el audio.
//!
//! ¿Por qué así?
//! - El loopback nos garantiza que PC/ICE/Transceivers/SDP están bien.
//! - El DataChannel nos sirve para: parciales STT, texto del agente, señales TTS y barge_in.
//! - Próximas etapas: enganchar STT (whisper-rs), GPT y TTS sin romper lo que funciona.

// ==========================
// = Imports y tipos base   =
// ==========================

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Serialize;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::data_channel_init::RTCDataChannelInit;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::data_channel::RTCDataChannel;
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::rtp::packet::Packet; // para reescritura SSRC/PT
use webrtc::rtp_transceiver::rtp_codec::{RTCRtpCodecCapability, RTPCodecType};
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::TrackLocal;
use webrtc::track::track_local::TrackLocalWriter; // trae write_rtp(&Packet) al scope
use webrtc::track::track_remote::TrackRemote; // para leer RTP remoto

use super::stats_helper::install_selected_pair_logger;
use crate::auth::{validate_ws_token_multi, TokenProfile, WsClaims};
use crate::routes::labs::ai_pipeline::AiPipeline;
use crate::routes::AppState;

// ==========================
// = Tipos HTTP / Respuestas=
// ==========================

/// Respuesta HTTP con la SDP answer final
#[derive(Serialize)]
pub struct SdpResponse {
    pub sdp: String,
    pub r#type: String,
}

// ==========================
// = Handler principal HTTP =
// ==========================
//
// Recibe:     Offer SDP (navegador)            → Json<RTCSessionDescription>
// Devuelve:   Answer SDP (servidor)             → Json<SdpResponse>
// Seguridad:  Origin permitido + JWT (perfil lab-05)
// Conexión:   Crea PeerConnection, añade audio sendrecv y DataChannel.
// Media:      Loopback RTP (eco) manteniendo extensiones RTP (MID/transport-cc).
// Señalización: Offer → Answer + espera a ICE gathering.
//
#[cfg_attr(debug_assertions, axum::debug_handler)]
pub async fn handle_lab05(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(offer_sdp): Json<RTCSessionDescription>,
) -> Result<Json<SdpResponse>, (StatusCode, String)> {
    // -------------------------------------------------------------
    // (1) Seguridad: Origin + Bearer JWT (perfil lab-05)
    // -------------------------------------------------------------
    validate_origin(&headers, &state)?;
    let _claims = validate_bearer_lab05(&headers, &state)?;

    // -------------------------------------------------------------
    // (2) API WebRTC + PeerConnection con STUN públicos
    // -------------------------------------------------------------
    // MediaEngine: codecs por default (incluye Opus).
    let mut m = MediaEngine::default();
    m.register_default_codecs().map_err(internal)?;
    let api = APIBuilder::new().with_media_engine(m).build();

    // Servidores STUN: necesarios para obtener candidatos públicos (ICE).
    let config = RTCConfiguration {
        ice_servers: vec![
            RTCIceServer {
                urls: vec!["stun:stun.l.google.com:19302".into()],
                ..Default::default()
            },
            RTCIceServer {
                urls: vec!["stun:stun.cloudflare.com:3478".into()],
                ..Default::default()
            },
        ],
        ..Default::default()
    };

    // PeerConnection del servidor.
    let pc = Arc::new(api.new_peer_connection(config).await.map_err(internal)?);

    // -------------------------------------------------------------
    // (2.1) Observabilidad: logs de estados ICE/PC + pair seleccionado
    //       + cierre ordenado con CancellationToken
    // -------------------------------------------------------------
    let pc_closed_flag = Arc::new(AtomicBool::new(false));
    let cancel_pc = CancellationToken::new();
    {
        // a) Estado ICE → cancel y cierre
        let pc_ref = Arc::clone(&pc);
        let cancel_for_ice = cancel_pc.clone();
        let pc_for_ice_close = Arc::clone(&pc);
        let closed_flag_ice = Arc::clone(&pc_closed_flag);
        pc_ref.on_ice_connection_state_change(Box::new(move |st: RTCIceConnectionState| {
            info!("(lab05) ICE state = {:?}", st);
            if matches!(
                st,
                RTCIceConnectionState::Disconnected
                    | RTCIceConnectionState::Failed
                    | RTCIceConnectionState::Closed
            ) {
                cancel_for_ice.cancel();
                if !closed_flag_ice.swap(true, Ordering::SeqCst) {
                    let pc_to_close = Arc::clone(&pc_for_ice_close);
                    tokio::spawn(async move {
                        if let Err(e) = pc_to_close.close().await {
                            warn!("pc.close() error (ICE cb): {e:?}");
                        } else {
                            info!("PC closed (server-side)");
                        }
                    });
                }
            }
            Box::pin(async {})
        }));

        // b) Estado general del PeerConnection → mismo criterio
        let pc_ref = Arc::clone(&pc);
        let cancel_for_pc = cancel_pc.clone();
        let pc_for_pc_close = Arc::clone(&pc);
        let closed_flag_pc = Arc::clone(&pc_closed_flag);
        pc_ref.on_peer_connection_state_change(Box::new(move |st: RTCPeerConnectionState| {
            info!("(lab05) PC state = {:?}", st);
            if matches!(
                st,
                RTCPeerConnectionState::Disconnected
                    | RTCPeerConnectionState::Failed
                    | RTCPeerConnectionState::Closed
            ) {
                cancel_for_pc.cancel();
                if !closed_flag_pc.swap(true, Ordering::SeqCst) {
                    let pc_to_close = Arc::clone(&pc_for_pc_close);
                    tokio::spawn(async move {
                        if let Err(e) = pc_to_close.close().await {
                            warn!("pc.close() error (PC cb): {e:?}");
                        } else {
                            info!("PC closed (server-side)");
                        }
                    });
                }
            }
            Box::pin(async {})
        }));

        // c) Log del par ICE seleccionado
        install_selected_pair_logger(&pc);
    }

    // -------------------------------------------------------------
    // (3) AUDIO saliente: transceiver + TrackLocal (Opus) antes de señalización
    // -------------------------------------------------------------
    pc.add_transceiver_from_kind(RTPCodecType::Audio, None)
        .await
        .map_err(internal)?;

    let local_track = Arc::new(TrackLocalStaticRTP::new(
        RTCRtpCodecCapability {
            mime_type: "audio/opus".into(),
            clock_rate: 48000,
            channels: 2,
            sdp_fmtp_line: "".into(),
            rtcp_feedback: vec![],
        },
        "audio".to_string(), // track id
        "lab05".to_string(), // stream id (cosmético)
    ));

    // Inyectamos TrackLocal en el transceiver de AUDIO
    let mut audio_sender_opt = None;
    for (i, t) in pc.get_transceivers().await.iter().enumerate() {
        let dir = t.direction();
        let cur = t.current_direction();
        info!("(lab05) xcev[{i}] dir={:?} current={:?}", dir, cur);
        if t.kind() == RTPCodecType::Audio {
            let s = t.sender().await;
            audio_sender_opt = Some(s);
            break;
        }
    }

    let rtp_sender = match audio_sender_opt {
        Some(s) => {
            s.replace_track(Some(
                local_track.clone() as Arc<dyn TrackLocal + Send + Sync>
            ))
            .await
            .map_err(internal)?;
            s
        }
        None => return Err(internal("no audio transceiver found")),
    };

    // Mantener vivo el sender: leer RTCP evita bloqueos internos
    {
        let rtp_sender = rtp_sender.clone();
        tokio::spawn(async move {
            let mut rtcp_buf = vec![0u8; 1500];
            while rtp_sender.read(&mut rtcp_buf).await.is_ok() {}
            info!("(lab05) RTCP reader ended");
        });
    }

    // SSRC/PT locales (para reescritura en el eco)
    let params = rtp_sender.get_parameters().await;
    let local_ssrc: Option<u32> = params.encodings.first().map(|e| e.ssrc);
    let local_pt: Option<u8> = params.rtp_parameters.codecs.first().map(|c| c.payload_type);
    info!(
        "✅ [lab05] sender attached (local_ssrc={:?} local_pt={:?})",
        local_ssrc, local_pt
    );

    // -------------------------------------------------------------
    // (4) DataChannel "chat": bus de control (ping/barge_in/eco)
    // -------------------------------------------------------------
    setup_data_channels(&pc, &cancel_pc).await;

    // -------------------------------------------------------------
    // (5) Loopback de AUDIO (on_track → reescritura SSRC/PT → TrackLocal)
    //     *Registrar callback ANTES de set_remote_description*
    // -------------------------------------------------------------
    install_audio_loopback(
        &pc,
        local_track.clone(),
        local_ssrc,
        local_pt,
        cancel_pc.clone(),
    );

    // -------------------------------------------------------------
    // (6) Señalización: Offer → Answer (+ esperar ICE gathering)
    // -------------------------------------------------------------
    pc.set_remote_description(offer_sdp)
        .await
        .map_err(internal)?;
    let answer = pc.create_answer(None).await.map_err(internal)?;
    let mut gather_rx = pc.gathering_complete_promise().await;
    pc.set_local_description(answer).await.map_err(internal)?;
    let _ = gather_rx.recv().await;

    // Extraemos la SDP local final (ya con candidatos ICE) y respondemos al cliente.
    let local = pc
        .local_description()
        .await
        .ok_or_else(|| internal("missing local_description"))?;
    Ok(Json(SdpResponse {
        sdp: local.sdp,
        r#type: "answer".into(),
    }))
}

// ==================================================
// = DataChannel (chat/control)                     =
// ==================================================
// Creamos un DataChannel "chat" del lado servidor y también
// adoptamos cualquier canal que cree el cliente (on_data_channel).
// Handlers:
//   - on_open: mandamos banner de "ready".
//   - on_message: ping/pong, barge_in (stub), eco de texto, log binario.
//   - on_close: log.

async fn setup_data_channels(
    pc: &Arc<webrtc::peer_connection::RTCPeerConnection>,
    cancel_pc: &CancellationToken,
) {
    // 1) Crear DC "chat" (in-band). negotiated=None → NO pre-negociado.
    let dc_init = RTCDataChannelInit {
        negotiated: None,
        ..Default::default()
    };
    let dc = pc.create_data_channel("chat", Some(dc_init)).await;

    match dc {
        Ok(dc) => install_chat_handlers(dc, cancel_pc),
        Err(e) => warn!("(lab05) create_data_channel('chat') failed: {e:?}"),
    }

    // 2) Si el cliente abre uno, instalamos handlers también.
    let cancel_clone = cancel_pc.clone();
    pc.on_data_channel(Box::new(move |dc: Arc<RTCDataChannel>| {
        info!(
            "(lab05) on_data_channel: label='{}' id={:?}",
            dc.label(),
            dc.id()
        );
        install_chat_handlers(dc, &cancel_clone);
        Box::pin(async {})
    }));
}

// Registra handlers del DataChannel "chat".
fn install_chat_handlers(dc: Arc<RTCDataChannel>, cancel_pc: &CancellationToken) {
    // a) on_open: anunciamos disponibilidad al cliente.
    let dc_open = Arc::clone(&dc);
    dc.on_open(Box::new(move || {
        let dc = Arc::clone(&dc_open);
        info!("(lab05) DataChannel 'chat' open");
        Box::pin(async move {
            let _ = dc
                .send_text(r#"{"type":"ready","lab":"lab-05","role":"server"}"#)
                .await;
        })
    }));

    // b) on_message: protocolo mínimo de control (ping/pong, barge_in, eco).
    let dc_msg = Arc::clone(&dc);
    let cancel_on_msg = cancel_pc.clone();
    dc.on_message(Box::new(move |msg: DataChannelMessage| {
        let dc = Arc::clone(&dc_msg);
        let cancel = cancel_on_msg.clone();
        Box::pin(async move {
            if cancel.is_cancelled() {
                return; // si el PC está cancelado, ignoramos mensajes
            }
            if msg.is_string {
                // Texto → convertir buffer UTF-8 a String.
                let text = String::from_utf8(msg.data.to_vec()).unwrap_or_default();
                match text.as_str() {
                    // Health check del canal
                    r#"{"type":"ping"}"# => {
                        let _ = dc.send_text(r#"{"type":"pong"}"#).await;
                    }
                    // Señal de interrupción (barge-in): por ahora sólo ACK.
                    // En etapas futuras: cortar TTS y resetear pipeline.
                    r#"{"type":"barge_in"}"# => {
                        info!("(lab05) barge_in recibido (stub)");
                        let _ = dc.send_text(r#"{"type":"ack","event":"barge_in"}"#).await;
                    }
                    // Cualquier otro mensaje → eco (útil para debug de front).
                    _ => {
                        let out = format!(
                            r#"{{"type":"echo","text":{}}}"#,
                            serde_json::to_string(&text).unwrap_or("null".into())
                        );
                        let _ = dc.send_text(&out).await;
                    }
                }
            } else {
                // Binario → por ahora sólo logueamos el tamaño.
                info!("(lab05) dc message (binary, {} bytes)", msg.data.len());
            }
        })
    }));

    // c) on_close: sólo log.
    dc.on_close(Box::new(move || {
        info!("(lab05) DataChannel 'chat' closed");
        Box::pin(async {})
    }));
}

// ==================================================
// = Loopback de AUDIO (on_track)                   =
// ==================================================
// Reenvía el RTP recibido (Opus) al TrackLocal, reescribiendo SSRC/PT
// para que el navegador acepte el flujo saliente como propio.
fn install_audio_loopback(
    pc: &Arc<webrtc::peer_connection::RTCPeerConnection>,
    local_track: Arc<TrackLocalStaticRTP>,
    local_ssrc: Option<u32>,
    local_pt: Option<u8>,
    cancel_pc: CancellationToken,
) {
    let lt = Arc::clone(&local_track);

    pc.on_track(Box::new(move |remote: Arc<TrackRemote>, _rx, _streams| {
        let lt = Arc::clone(&lt);
        let cancel = cancel_pc.clone();

        Box::pin(async move {
            // Solo actuamos sobre AUDIO
            if remote.kind() != RTPCodecType::Audio {
                info!("(lab05) on_track ignorado (kind != audio)");
                return;
            }

            info!(
                "(lab05) on_track AUDIO: ssrc_in={:?} pt_in={:?} codec={}",
                remote.ssrc(),
                remote.payload_type(),
                remote.codec().capability.mime_type
            );

            // Bucle de reenvío RTP → local_track (eco)
            tokio::spawn(async move {
                loop {
                    if cancel.is_cancelled() {
                        info!("(lab05) loopback cancelado");
                        break;
                    }

                    // Leer paquete RTP del track remoto
                    let (mut pkt, _attrs) = match remote.read_rtp().await {
                        Ok(t) => t, // (Packet, attributes)
                        Err(err) => {
                            warn!("(lab05) read_rtp terminó: {err:?}");
                            break;
                        }
                    };

                    // Reescribir PT/SSRC a los del sender local (si existen)
                    if let Some(pt) = local_pt {
                        pkt.header.payload_type = pt;
                    }
                    if let Some(ssrc) = local_ssrc {
                        pkt.header.ssrc = ssrc;
                    }

                    // Enviar a nuestro TrackLocal (manteniendo seq/timestamp del inbound)
                    if let Err(e) = lt.write_rtp(&pkt).await {
                        warn!("(lab05) write_rtp error: {e:?}");
                        break;
                    }
                }

                info!("(lab05) loopback finalizado");
            });
        })
    }));
}

// ==================================================
// = Pipeline IA (skeleton, NO usado en etapa 0)    =
// ==================================================
// Se deja montado para la siguiente etapa: de-packetizar Opus → PCM
// y alimentar STT → GPT → TTS. Por ahora, sólo se crea y se deja
// el canal preparado (no conectado al loopback).
fn _spawn_ai_pipeline_example() -> Result<(), (StatusCode, String)> {
    let ai_pipeline = Arc::new(
        AiPipeline::new(
            "models/ggml-base.en.bin",
            std::env::var("ELEVENLABS_API_KEY").unwrap(),
        )
        .map_err(internal)?,
    );

    // Canal interno para enviar chunks PCM hacia la pipeline AI
    let (_tx_audio, mut rx_audio) = mpsc::channel::<Vec<f32>>(32);

    tokio::spawn({
        let ai_pipeline = ai_pipeline.clone();
        async move {
            while let Some(pcm_chunk) = rx_audio.recv().await {
                // 1) Whisper STT (asumimos 48k estéreo)
                let transcript = match ai_pipeline.transcribe_audio(&pcm_chunk, 48_000, 2) {
                    Ok(t) => t,
                    Err(e) => {
                        error!("Error en STT: {:?}", e);
                        continue;
                    }
                };

                // 2) GPT
                let gpt_reply = match ai_pipeline.generate_response(&transcript).await {
                    Ok(r) => r,
                    Err(e) => {
                        error!("Error GPT: {:?}", e);
                        continue;
                    }
                };

                // 3) TTS (PCM 16k mono bytes)
                match ai_pipeline.synthesize_audio(&gpt_reply).await {
                    Ok(tts_pcm_16k) => {
                        info!("🔊 TTS generado ({} bytes, pcm_16000)", tts_pcm_16k.len());
                        // TODO: convertir PCM 16k → Opus RTP y enviar por `local_track`
                    }
                    Err(e) => error!("Error ElevenLabs: {:?}", e),
                }
            }
        }
    });

    Ok(())
}

// ==================================================
// = Seguridad: Origin + Bearer (JWT lab-05)        =
// ==================================================

fn validate_origin(headers: &HeaderMap, state: &AppState) -> Result<(), (StatusCode, String)> {
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        let ok = state.allowed_ws_origins.iter().any(|o| o == origin);
        if ok {
            return Ok(());
        }
    }
    Err((StatusCode::FORBIDDEN, "invalid origin".into()))
}

fn validate_bearer_lab05(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<WsClaims, (StatusCode, String)> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let token = auth
        .strip_prefix("Bearer ")
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer".to_string()))?;

    // Filtramos los perfiles que se admiten para este lab.
    let allow: Vec<TokenProfile> = state
        .profiles
        .iter()
        .cloned()
        .filter(|p| p.iss == "lab-05" && p.aud == "lab-webrtc-05-audio")
        .collect();

    if allow.is_empty() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            "lab-05 profile not configured".into(),
        ));
    }

    // Valida firma, expiración y que iss/aud pertenezcan a los perfiles permitidos.
    validate_ws_token_multi(token, &state.ws_secret, &allow).map_err(|e| {
        warn!("JWT inválido (lab-05): {e}");
        (StatusCode::UNAUTHORIZED, "unauthorized".into())
    })
}

// ==================================================
// = Helper de error interno                         =
// ==================================================

fn internal<E: std::fmt::Debug>(e: E) -> (StatusCode, String) {
    error!("Internal error: {e:?}");
    (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
}

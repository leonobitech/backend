//! Lab 05 — WebRTC Audio (loopback base + DataChannel "chat")
//!
//! Objetivo de esta etapa (0):
//! - Mantener el **loopback de audio** idéntico a Lab-04 (camino feliz ya probado).
//! - Agregar un **DataChannel "chat"** (bus de control) sin interferir con el audio.
//!
//! ¿Por qué así?
//! - El loopback nos garantiza que PC/ICE/Transceivers/SDP están bien.
//! - El DataChannel nos sirve para: parciales STT, texto del agente, señales TTS y barge_in.
//! - Próximas etapas: enganchar STT (whisper-rs), GPT-4o y TTS sin romper lo que funciona.

// ============= Imports base y tipos del proyecto =============

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Serialize;
use tracing::{info, warn, error};

use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;

use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::ice_transport::ice_server::RTCIceServer;

use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

use webrtc::rtp_transceiver::rtp_codec::{RTCRtpCodecCapability, RTPCodecType};

use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::TrackLocal;

use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::data_channel::data_channel_init::RTCDataChannelInit;
use webrtc::data_channel::RTCDataChannel;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use crate::routes::AppState;
use crate::auth::{validate_ws_token_multi, TokenProfile, WsClaims};

use super::stats_helper::install_selected_pair_logger;
use crate::routes::labs::ai_pipeline::AiPipeline;

// Respuesta HTTP con la SDP answer final
#[derive(Serialize)]
pub struct SdpResponse { pub sdp: String, pub r#type: String }

// ============= Handler principal HTTP =============
//
// Recibe:     Offer SDP (navegador)            → Json<RTCSessionDescription>
// Devuelve:   Answer SDP (servidor)             → Json<SdpResponse>
// Seguridad:  Origin permitido + JWT (perfil lab-05)
// Conexión:   Crea PeerConnection, añade audio sendrecv y DataChannel.
// Media:      Loopback RTP (eco) manteniendo extensiones RTP (MID/transport-cc).
// Señalización: Offer → Answer + espera a ICE gathering.
//
#[axum::debug_handler]
pub async fn handle_lab05(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(offer_sdp): Json<RTCSessionDescription>,
) -> Result<Json<SdpResponse>, (StatusCode, String)> {
    // ---------------- (1) Seguridad: Origin + Bearer JWT (perfil lab-05) ----------------
    // Origin: evita que terceros no autorizados llamen al endpoint.
    // JWT: valida iss/aud para Lab-05.
    validate_origin(&headers, &state)?;
    let _claims = validate_bearer_lab05(&headers, &state)?;

    // ---------------- (2) API WebRTC + PeerConnection con STUN públicos -----------------
    // MediaEngine: codecs por default (incluye Opus).
    let mut m = MediaEngine::default();
    m.register_default_codecs().map_err(internal)?;
    let api = APIBuilder::new().with_media_engine(m).build();

    // Servidores STUN: necesarios para obtener candidatos públicos (ICE).
    let config = RTCConfiguration {
        ice_servers: vec![
            RTCIceServer { urls: vec!["stun:stun.l.google.com:19302".into()], ..Default::default() },
            RTCIceServer { urls: vec!["stun:stun.cloudflare.com:3478".into()], ..Default::default() },
        ],
        ..Default::default()
    };

    // PeerConnection del servidor.
    let pc = Arc::new(api.new_peer_connection(config).await.map_err(internal)?);

    // ---------------- Pipeline AI ----------------
    let ai_pipeline = Arc::new(
        AiPipeline::new(
            "models/ggml-base.en.bin",
            std::env::var("ELEVENLABS_API_KEY").unwrap(),
        ).map_err(internal)?
    );

    // Canal interno para enviar chunks PCM hacia la pipeline AI
    let (tx_audio, mut rx_audio) = mpsc::channel::<Vec<f32>>(32);

    // Hook: procesar audio entrante (STT -> GPT -> TTS)
    tokio::spawn({
        let ai_pipeline = ai_pipeline.clone();
        async move {
            while let Some(pcm_chunk) = rx_audio.recv().await {
                // 1) Whisper STT (detección básica: asumimos 48k estéreo aquí)
                let transcript = match ai_pipeline.transcribe_audio(&pcm_chunk, 48_000, 2) {
                    Ok(t) => t,
                    Err(e) => {
                        tracing::error!("Error en STT: {:?}", e);
                        continue;
                    }
                };

                // 2) GPT-4o
                let gpt_reply = match ai_pipeline.generate_response(&transcript).await {
                    Ok(r) => r,
                    Err(e) => {
                        tracing::error!("Error GPT: {:?}", e);
                        continue;
                    }
                };

                // 3) ElevenLabs TTS (PCM 16k mono bytes)
                match ai_pipeline.synthesize_audio(&gpt_reply).await {
                    Ok(tts_pcm_16k) => {
                        tracing::info!("🔊 TTS generado ({} bytes, pcm_16000)", tts_pcm_16k.len());
                        // TODO: convertir PCM 16k → Opus RTP y enviar por `local_track`
                    }
                    Err(e) => tracing::error!("Error ElevenLabs: {:?}", e),
                }
            }
        }
    });

    // ---------------- (2.1) Observabilidad: logs de estados ICE/PC + pair seleccionado ----

    // Señalización y cierre ordenado: flags/CancelToken para terminar tareas asíncronas cuando
    // el PC se desconecta/falla/cierra.
    let pc_closed_flag = Arc::new(AtomicBool::new(false));
    let cancel_pc = CancellationToken::new();
    {
        // a) Estado ICE (Disconnected/Failed/Closed → cancelamos tareas y cerramos PC)
        let pc_ref = Arc::clone(&pc);
        let cancel_for_ice = cancel_pc.clone();
        let pc_for_ice_close = Arc::clone(&pc);
        let closed_flag_ice = Arc::clone(&pc_closed_flag);
        pc_ref.on_ice_connection_state_change(Box::new(move |st: RTCIceConnectionState| {
            info!("(lab05) ICE state = {:?}", st);
            if matches!(st, RTCIceConnectionState::Disconnected | RTCIceConnectionState::Failed | RTCIceConnectionState::Closed) {
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

        // b) Estado general del PeerConnection (mismo criterio de cierre)
        let pc_ref = Arc::clone(&pc);
        let cancel_for_pc = cancel_pc.clone();
        let pc_for_pc_close = Arc::clone(&pc);
        let closed_flag_pc = Arc::clone(&pc_closed_flag);
        pc_ref.on_peer_connection_state_change(Box::new(move |st: RTCPeerConnectionState| {
            info!("(lab05) PC state = {:?}", st);
            if matches!(st, RTCPeerConnectionState::Disconnected | RTCPeerConnectionState::Failed | RTCPeerConnectionState::Closed) {
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

        // c) Log del par ICE seleccionado (útil para debug de conectividad/red)
        install_selected_pair_logger(&pc);
    }

    // ---------------- (3) AUDIO: transceiver + track local (antes de señalización) --------
    // Creamos una m-line de AUDIO y adjuntamos un TrackLocal (Opus) ANTES de setLocalDescription:
    // → Así la SDP local ya incluye SSRC/MSID de nuestro flujo saliente.
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
        "lab05".to_string(), // stream id (cosmético; ayuda a identificar en el cliente)
    ));

    // Buscamos el transceiver de audio y le "inyectamos" nuestro TrackLocal.
    // Esto garantiza que el RTP de salida use la misma m-line/MID negociada.
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
            s.replace_track(Some(local_track.clone() as Arc<dyn TrackLocal + Send + Sync>))
                .await
                .map_err(internal)?;
            s
        }
        None => return Err(internal("no audio transceiver found")),
    };

    // Mantener vivo el sender: leer RTCP evita bloqueos/colas internas
    {
        let rtp_sender = rtp_sender.clone();
        tokio::spawn(async move {
            let mut rtcp_buf = vec![0u8; 1500];
            while let Ok(_) = rtp_sender.read(&mut rtcp_buf).await {}
            info!("(lab05) RTCP reader ended");
        });
    }

    // Obtenemos SSRC/PT locales → los usaremos para reescribir INBOUND y que el browser acepte el eco.
    let params = rtp_sender.get_parameters().await;
    let local_ssrc: Option<u32> = params.encodings.get(0).map(|e| e.ssrc);
    let local_pt:   Option<u8>  = params.rtp_parameters.codecs.get(0).map(|c| c.payload_type);
    info!("✅ [lab05] sender attached (local_ssrc={:?} local_pt={:?})", local_ssrc, local_pt);

    // ---------------- (4) DataChannel "chat": bus de control (ping/barge_in/eco) ----------
    // Nota: negotiated=None → in-band (puede abrirlo server o client).
    setup_data_channels(&pc, &cancel_pc).await;

    // ---------------- (5) Señalización: Offer → Answer (+ esperar ICE gathering) ----------
    // Orden correcto:
    // 1) set_remote_description(offer)
    // 2) create_answer()
    // 3) gathering_complete_promise()
    // 4) set_local_description(answer)
    // 5) esperar a gather complete y devolver la SDP
    pc.set_remote_description(offer_sdp).await.map_err(internal)?;
    let answer = pc.create_answer(None).await.map_err(internal)?;
    let mut gather_rx = pc.gathering_complete_promise().await;
    pc.set_local_description(answer).await.map_err(internal)?;
    let _ = gather_rx.recv().await;

    // Extraemos la SDP local final (ya con candidatos ICE) y respondemos al cliente.
    let local = pc.local_description().await.ok_or_else(|| internal("missing local_description"))?;
    Ok(Json(SdpResponse { sdp: local.sdp, r#type: "answer".into() }))
}

// ============= DataChannel (chat/control) =============
//
// Creamos un DataChannel "chat" del lado servidor y también
// adoptamos cualquier canal que cree el cliente (on_data_channel).
// Handlers:
//   - on_open: mandamos banner de "ready".
//   - on_message: ping/pong, barge_in (stub), eco de texto, log binario.
//   - on_close: log.
//
async fn setup_data_channels(pc: &Arc<webrtc::peer_connection::RTCPeerConnection>, cancel_pc: &CancellationToken) {
    // 1) Crear DC "chat" (in-band). negotiated=None indica que NO es pre-negociado.
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
        info!("(lab05) on_data_channel: label='{}' id={:?}", dc.label(), dc.id());
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
            let _ = dc.send_text(r#"{"type":"ready","lab":"lab-05","role":"server"}"#).await;
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

// ============= Helpers de seguridad =============
//
// - validate_origin: chequea que la cabecera Origin esté en la allowlist.
// - validate_bearer_lab05: valida JWT contra iss/aud de Lab-05.
//
fn validate_origin(headers: &HeaderMap, state: &AppState) -> Result<(), (StatusCode, String)> {
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        let ok = state.allowed_ws_origins.iter().any(|o| o == origin);
        if ok { return Ok(()); }
    }
    Err((StatusCode::FORBIDDEN, "invalid origin".into()))
}

fn validate_bearer_lab05(headers: &HeaderMap, state: &AppState) -> Result<WsClaims, (StatusCode, String)> {
    let auth = headers.get("authorization").and_then(|v| v.to_str().ok()).unwrap_or("");
    let token = auth.strip_prefix("Bearer ").ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer".to_string()))?;

    // Filtramos los perfiles que se admiten para este lab.
    let allow: Vec<TokenProfile> = state
        .profiles
        .iter()
        .cloned()
        .filter(|p| p.iss == "lab-05" && p.aud == "lab-webrtc-05-audio")
        .collect();

    if allow.is_empty() {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "lab-05 profile not configured".into()));
    }

    // Valida firma, expiración y que iss/aud pertenezcan a los perfiles permitidos.
    validate_ws_token_multi(token, &state.ws_secret, &allow).map_err(|e| {
        warn!("JWT inválido (lab-05): {e}");
        (StatusCode::UNAUTHORIZED, "unauthorized".into())
    })
}

// ============= Helper de error interno =============
//
// Envuelve errores en (StatusCode, String) y loguea con `error!` para troubleshooting.
//
fn internal<E: std::fmt::Debug>(e: E) -> (StatusCode, String) {
    error!("Internal error: {e:?}");
    (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
}

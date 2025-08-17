//! Lab 04 — WebRTC Audio (loopback) — Handler Axum (webrtc = "0.13.0")
//!
//! Flujo:
//! 1) Valida Origin + Bearer (iss/aud de lab-04).
//! 2) Crea API WebRTC y PeerConnection con STUN públicos.
//! 3) Añade transceiver de AUDIO (sendrecv).
//! 4) on_track: al llegar audio remoto, crea TrackLocal Opus y reenvía RTP (eco).
//! 5) Señalización Offer → Answer, espera ICE gathering y responde SDP final.

use std::sync::Arc;
use axum::{extract::State, http::{HeaderMap, StatusCode}, Json};
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
// ❗ No importamos RTCRtpTransceiverInit ni RTPReceiver: evitamos rutas que cambiaron.

use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::{TrackLocal, TrackLocalWriter}; // <- para write_rtp()

use crate::routes::AppState;
use crate::auth::{validate_ws_token_multi, TokenProfile, WsClaims};

use std::time::{Duration, Instant};
use tokio::time::{interval, MissedTickBehavior};
use tokio_util::sync::CancellationToken;

use super::stats_helper::install_selected_pair_logger;

#[derive(Serialize)]
pub struct SdpResponse { pub sdp: String, pub r#type: String }

#[axum::debug_handler]
pub async fn webrtc_offer_lab04(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(offer_sdp): Json<RTCSessionDescription>,
) -> Result<Json<SdpResponse>, (StatusCode, String)> {
    // 1) Seguridad: Origin + Bearer JWT (perfil lab-04)
    validate_origin(&headers, &state)?;
    let _claims = validate_bearer_lab04(&headers, &state)?;

    // 2) API WebRTC y PeerConnection con STUN
    let mut m = MediaEngine::default();
    m.register_default_codecs().map_err(internal)?;
    let api = APIBuilder::new().with_media_engine(m).build();

    let config = RTCConfiguration {
        ice_servers: vec![
            RTCIceServer { urls: vec!["stun:stun.l.google.com:19302".into()], ..Default::default() },
            RTCIceServer { urls: vec!["stun:stun.cloudflare.com:3478".into()], ..Default::default() },
        ],
        ..Default::default()
    };

    // PeerConnection
    let pc = Arc::new(api.new_peer_connection(config).await.map_err(internal)?);

    // Logs útiles de estado (opcional)
    {
        let pc_ref = Arc::clone(&pc); // Logs: ICE state = Checking → ICE state = Connected
        pc_ref.on_ice_connection_state_change(Box::new(move |st: RTCIceConnectionState| {
            info!("ICE state = {:?}", st);
            Box::pin(async {})
        }));
        let pc_ref = Arc::clone(&pc); // Logs: PC state = Connecting → PC state = Connected
        pc_ref.on_peer_connection_state_change(Box::new(move |st: RTCPeerConnectionState| {
            info!("PC state = {:?}", st);
            Box::pin(async {})
        }));

        // stats selected pair connection
        install_selected_pair_logger(&pc);
    }

    // 3) Transceiver AUDIO sendrecv
    //    En 0.13 podemos pasar None (dirección por defecto = SendRecv).
    pc.add_transceiver_from_kind(RTPCodecType::Audio, None)
        .await
        .map_err(internal)?;

    // 4) on_track: loopback RTP (eco)
    {
        // Clonamos el Arc del PeerConnection porque lo vamos a mover dentro del closure de on_track.
        // (Arc = contador de referencias thread-safe; cada clon comparte el mismo PC subyacente)
        let pc2 = Arc::clone(&pc);

        // Registramos el callback que se dispara cuando el servidor recibe *una pista remota* (del cliente).
        // Firma en webrtc 0.13: |track_remote, _receiver, _transceiver| (los dos últimos no los usamos aquí).
        pc.on_track(Box::new(move |track_remote, _receiver, _transceiver| {
            // Necesitamos otro clon dentro del closure movido al async.
            let pc2 = Arc::clone(&pc2);

            Box::pin(async move {
                // 1) Aceptamos sólo AUDIO. Si llegara una pista de video u otra cosa, salimos.
                if track_remote.kind() != RTPCodecType::Audio {
                    return;
                }

                // 2) Logueamos el códec de la pista remota. En 0.13 `codec()` es síncrono.
                //    (Suele ser Opus 48kHz/2ch para audio WebRTC.)
                info!("🛰️ [lab04] track AUDIO remota: codec={:?}", track_remote.codec());

                // 3) Creamos una *pista local RTP* (TrackLocalStaticRTP) con capacidad Opus.
                //    Esta pista es la que el SERVIDOR va a "inyectar" de vuelta hacia el cliente,
                //    para que el navegador la reciba como *pista remota* (eco/loopback).
                //
                //    NOTA: Debe coincidir el códec "mime_type" con lo que negociaste (Opus).
                let local_track = Arc::new(TrackLocalStaticRTP::new(
                    RTCRtpCodecCapability {
                        mime_type: "audio/opus".into(),
                        clock_rate: 48000,       // WebRTC-Opus típico
                        channels: 2,             // 2 canales; si quisieras mono, podrías usar 1
                        sdp_fmtp_line: "".into(),// sin parámetros extra (minptime/fec ya los verá SDP del peer)
                        rtcp_feedback: vec![],   // feedback RTCP (transport-cc, etc.) no es necesario aquí
                    },
                    "audio".to_string(),        // track id (etiqueta local)
                    "lab04".to_string(),        // stream id (agrupa tracks)
                ));

                // 4) Enlazamos esa pista local al PeerConnection del servidor.
                //    `add_track` espera `Arc<dyn TrackLocal + Send + Sync>`, por eso el cast.
                //
                //    IMPORTANTE: ya creaste un transceiver AUDIO (SendRecv) antes de responder la SDP.
                //    Por eso al hacer `add_track` aquí, el sender se "cuelga" del transceiver existente
                //    y NO fuerza renegociación (se adjunta a la sección m=audio ya creada).
                let sender_res = pc2
                    .add_track(Arc::clone(&local_track) as Arc<dyn TrackLocal + Send + Sync>)
                    .await;

                // Manejo de errores al añadir el track (si PC ya cerró, etc.).
                let rtp_sender = match sender_res {
                    Ok(s) => s,
                    Err(e) => { 
                        warn!("add_track error: {e:?}"); 
                        return; 
                    }
                };

                // 5) Mantenemos vivo el sender leyendo RTCP en un task aparte.
                //    - Algunos stacks esperan que leas RTCP periódicamente; además aquí
                //      capturás feedback/estimaciones si las necesitás en el futuro.
                //    - Cuando el peer se cierre, `read()` fallará y el task saldrá solo.
                tokio::spawn({
                    let mut rtcp_buf = vec![0u8; 1500];
                    async move {
                        while let Ok(_) = rtp_sender.read(&mut rtcp_buf).await {
                            // Podrías parsear/usar RTCP aquí si quisieras métricas extra.
                        }
                        // Al salir de este bucle, el sender ya no está activo.
                    }
                });

                // 6) Bucle principal de *eco RTP*:
                //    - Leemos paquetes RTP entrantes de la pista remota (tu mic del navegador)
                //      con `track_remote.read_rtp()`, que devuelve `(Packet, attrs)`.
                //    - Escribimos **el mismo Packet** en `local_track.write_rtp(&pkt)`,
                //      lo que hace que el servidor reenvíe ese audio al cliente como pista remota.
                //
                //    En otras palabras: mic (cliente) → RTP → servidor → `write_rtp(pkt)` → RTP de vuelta → cliente (eco).
                tokio::spawn({
                // --- métricas ---
                let mut pkt_count: u64 = 0;
                let mut byte_bucket: u64 = 0;
                let mut last_log = Instant::now();
                let mut last_pkt_at = Instant::now();
                let mut first_ssrc: Option<u32> = None;

                // --- watchdog ---
                let mut watchdog = interval(Duration::from_secs(3));
                watchdog.set_missed_tick_behavior(MissedTickBehavior::Skip);

                // --- cancelación controlada ---
                let cancel = CancellationToken::new();

                // Clon del track local para escribir
                let local_track = Arc::clone(&local_track);
                // Clon del PC para consultar estado en el watchdog
                let pc_for_watch = Arc::clone(&pc2);

                async move {
                    loop {
                        tokio::select! {
                            // 1) Datos RTP entrantes
                            res = track_remote.read_rtp() => {
                                match res {
                                    Ok((pkt, _attrs)) => {
                                        let ssrc = pkt.header.ssrc;
                                        let seq  = pkt.header.sequence_number;
                                        let ts   = pkt.header.timestamp;
                                        let payload_len = pkt.payload.len();

                                        if first_ssrc.is_none() {
                                            first_ssrc = Some(ssrc);
                                            info!("🎙️ [lab04] inbound RTP started: SSRC={ssrc}");
                                        }

                                        pkt_count += 1;
                                        byte_bucket += payload_len as u64;
                                        last_pkt_at = Instant::now();

                                        // Log rate-limited (~1s)
                                        if last_log.elapsed() >= Duration::from_secs(1) {
                                            let secs = last_log.elapsed().as_secs_f64().max(1e-3);
                                            let kbps = (byte_bucket as f64 * 8.0 / 1000.0) / secs;
                                            info!(
                                                "🎧 [lab04] RTP in: pkts_total={} ~{:.1} kbps | last seq={} ts={} payload={}B",
                                                pkt_count, kbps, seq, ts, payload_len
                                            );
                                            byte_bucket = 0;
                                            last_log = Instant::now();
                                        }

                                        // Loopback
                                        if let Err(e) = local_track.write_rtp(&pkt).await {
                                            warn!("write_rtp error: {e:?}");
                                            break;
                                        }
                                    }
                                    Err(e) => {
                                        // Si read_rtp() falla, salimos
                                        warn!("read_rtp ended: {e:?}");
                                        break;
                                    }
                                }
                            }

                            // 2) Señal de cancelación (PC cerrado/fallido)
                            _ = cancel.cancelled() => {
                                let st = pc_for_watch.connection_state();
                                warn!("🔚 [lab04] cancel received (pc state = {:?}) → stopping RTP loop", st);
                                break;
                            }

                            // 3) Watchdog: si no llegan paquetes y el PC no está conectado → salir
                            _ = watchdog.tick() => {
                                let idle = last_pkt_at.elapsed();
                                let st = pc_for_watch.connection_state();
                                if idle >= Duration::from_secs(5) && st != RTCPeerConnectionState::Connected {
                                    warn!("⏳ [lab04] idle {:?} and pc state {:?} → stopping RTP loop", idle, st);
                                    break;
                                }
                                if idle >= Duration::from_secs(10) {
                                    // Si prefieres no salir aquí, baja este branch a un simple warn!
                                    warn!("⏳ [lab04] no inbound RTP for {:?} (state={:?})", idle, st);
                                }
                            }
                        }
                    }

                    info!("🛑 loopback finalizado");
                }
            });

                // Hasta aquí:
                // - Quedan dos tasks corriendo:
                //   (a) lector RTCP del sender
                //   (b) puente RTP remota→local (eco)
                // - Ambos saldrán naturalmente cuando el peer cierre/desconecte.
            })
        }));
    }


    // 5) Señalización: Offer → Answer
    // → have-remote-offer
    pc.set_remote_description(offer_sdp).await.map_err(internal)?;
    let answer = pc.create_answer(None).await.map_err(internal)?;

    // Esperar ICE gathering para incluir candidatos en la Answer
    let mut gather_rx = pc.gathering_complete_promise().await;
    // → stable
    pc.set_local_description(answer).await.map_err(internal)?;
    let _ = gather_rx.recv().await;

    // 6) Responder SDP final
    let local = pc.local_description().await.ok_or_else(|| internal("missing local_description"))?;
    Ok(Json(SdpResponse { sdp: local.sdp, r#type: "answer".into() }))
}

/* ───────────── Seguridad & Util ───────────── */

fn validate_origin(headers: &HeaderMap, state: &AppState) -> Result<(), (StatusCode, String)> {
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        let ok = state.allowed_ws_origins.iter().any(|o| o == origin);
        if ok { return Ok(()); }
    }
    Err((StatusCode::FORBIDDEN, "invalid origin".into()))
}

fn validate_bearer_lab04(headers: &HeaderMap, state: &AppState) -> Result<WsClaims, (StatusCode, String)> {
    let auth = headers.get("authorization").and_then(|v| v.to_str().ok()).unwrap_or("");
    let token = auth.strip_prefix("Bearer ").ok_or_else(|| (StatusCode::UNAUTHORIZED, "missing bearer".to_string()))?;

    let allow: Vec<TokenProfile> = state
        .profiles
        .iter()
        .cloned()
        .filter(|p| p.iss == "lab-04" && p.aud == "lab-webrtc-04-audio")
        .collect();

    if allow.is_empty() {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, "lab-04 profile not configured".into()));
    }

    validate_ws_token_multi(token, &state.ws_secret, &allow).map_err(|e| {
        warn!("JWT inválido (lab-04): {e}");
        (StatusCode::UNAUTHORIZED, "unauthorized".into())
    })
}

fn internal<E: std::fmt::Debug>(e: E) -> (StatusCode, String) {
    error!("Internal error: {e:?}");
    (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
}

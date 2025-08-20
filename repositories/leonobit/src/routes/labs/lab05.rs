//! Lab 05 — WebRTC STT + LLM + TTS
//!
//! Skeleton inicial que compila sin errores.

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::routes::AppState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

/// Respuesta temporal (skeleton)
#[derive(Debug, Serialize, Deserialize)]
pub struct EchoResponse {
    pub sdp: String,
    pub r#type: String,
}

/// Handler principal Lab-05 (skeleton)
pub async fn handle_lab05(
    _headers: HeaderMap,
    State(_state): State<AppState>, // <-- 🔹 CAMBIO CLAVE
    Json(offer): Json<RTCSessionDescription>,
) -> Result<Json<RTCSessionDescription>, StatusCode> {
    info!("🎧 [Lab-05] Nueva oferta WebRTC recibida");

    // TODO: 1. Validar JWT y Origin.
    // TODO: 2. Crear API y PeerConnection.
    // TODO: 3. Añadir transceiver de audio (sendrecv).
    // TODO: 4. Crear DataChannel para chat e interrupciones.
    // TODO: 5. Manejar STT en streaming con whisper-rs.
    // TODO: 6. Llamar GPT-4o para generar respuesta.
    // TODO: 7. Enviar audio TTS vía RTP.
    // TODO: 8. Retornar Answer SDP.

    // Por ahora, devolvemos la misma oferta como "eco"
    Ok(Json(offer))
}

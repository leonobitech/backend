use crate::auth::types::WsClaims;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Extension,
        Query,
    },
    http::StatusCode,
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};
use tokio::{
    sync::mpsc,
    time::{sleep, Duration},
};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

pub type PeerSet = Arc<Mutex<HashSet<String>>>;

#[derive(Debug, Deserialize)]
struct Offer {
    sdp: String,
    #[allow(dead_code)]
    r#type: String,
}

#[derive(Debug, Serialize)]
struct Answer {
    sdp: String,
    r#type: String,
}

pub async fn ws_handler(
    Extension(peers): Extension<PeerSet>,
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    debug!("📡 Nueva solicitud WS en /ws/offer con params: {:?}", params);

    let Some(token) = params.get("token") else {
        warn!("⚠️ WS rechazado: falta token en query params");
        return Err(StatusCode::UNAUTHORIZED);
    };

    let secret = match std::env::var("WS_JWT_SECRET") {
        Ok(v) => v,
        Err(_) => {
            error!("❌ WS_JWT_SECRET no está configurado");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    let key = DecodingKey::from_secret(secret.as_bytes());

    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["ws"]);
    validation.set_issuer(&["leonobit"]);

    match decode::<WsClaims>(token, &key, &validation) {
        Ok(data) => {
            info!("✅ Token WS válido: sub={} role={:?}", data.claims.sub, data.claims.role);
            Ok(ws.on_upgrade(move |socket| handle_socket(socket, peers)))
        }
        Err(e) => {
            warn!("⚠️ WS rechazado: token inválido - {}", e);
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

async fn handle_socket(socket: WebSocket, peers: PeerSet) {
    let peer_id = Uuid::new_v4().to_string();

    {
        let mut p = peers.lock().unwrap();
        p.insert(peer_id.clone());
    }
    info!("🔗 Nueva conexión WebSocket: {}", &peer_id);

    let (mut sender, mut receiver) = socket.split();

    // Canal para mensajes automáticos
    let (pm_tx, mut pm_rx) = mpsc::unbounded_channel::<String>();
    let peer_for_task = peer_id.clone();

    tokio::spawn(async move {
        let mut count = 1;
        loop {
            sleep(Duration::from_secs(30)).await;
            let msg = format!("🤖 Mensaje automático #{count} desde el servidor - {peer_for_task}");
            if pm_tx.send(msg).is_err() {
                debug!("📴 No se pudo enviar mensaje automático, canal cerrado");
                break;
            }
            count += 1;
        }
    });

    loop {
        tokio::select! {
            Some(text) = pm_rx.recv() => {
                debug!("📤 Enviando mensaje automático a {}: {}", peer_id, text);
                if sender.send(Message::Text(text)).await.is_err() {
                    warn!("⚠️ No se pudo enviar mensaje automático a {}", peer_id);
                    break;
                }
            }
            maybe_msg = receiver.next() => {
                match maybe_msg {
                    Some(Ok(Message::Text(text))) => {
                        debug!("📥 Texto recibido de {}: {}", peer_id, text);
                        if let Ok(offer) = serde_json::from_str::<Offer>(&text) {
                            info!("📩 Oferta SDP recibida de {}: {}", peer_id, offer.sdp);
                            let answer = Answer {
                                sdp: format!("Respuesta SDP simulada para {}", peer_id),
                                r#type: "answer".into()
                            };
                            let payload = serde_json::to_string(&answer).unwrap();
                            if sender.send(Message::Text(payload)).await.is_err() {
                                warn!("⚠️ Falló envío de Answer a {}", peer_id);
                                break;
                            }
                        } else {
                            info!("📢 Mensaje eco desde {}: {}", peer_id, text);
                            if sender.send(Message::Text(format!("📢 Eco: {}", text))).await.is_err() {
                                warn!("⚠️ Falló envío de eco a {}", peer_id);
                                break;
                            }
                        }
                    }
                    Some(Ok(Message::Binary(_))) => debug!("📦 Binary recibido de {}", peer_id),
                    Some(Ok(Message::Ping(payload))) => {
                        debug!("📡 Ping recibido de {}", peer_id);
                        if sender.send(Message::Pong(payload)).await.is_err() { break; }
                    }
                    Some(Ok(Message::Pong(_))) => debug!("📡 Pong recibido de {}", peer_id),
                    Some(Ok(Message::Close(_))) => {
                        info!("🔻 Cliente cerró conexión: {}", peer_id);
                        break;
                    }
                    Some(Err(e)) => {
                        error!("⚠️ Error en WebSocket {}: {:?}", peer_id, e);
                        break;
                    }
                    None => {
                        debug!("⏹️ WS cerrado por el cliente {}", peer_id);
                        break;
                    }
                }
            }
        }
    }

    {
        let mut p = peers.lock().unwrap();
        p.remove(&peer_id);
    }
    info!("❌ Conexión eliminada: {}", peer_id);
}

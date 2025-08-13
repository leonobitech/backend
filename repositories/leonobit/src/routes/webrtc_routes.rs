use axum::{
    extract::{
        Query,
        ws::{Message, WebSocket, WebSocketUpgrade},
        Extension, // 👈 usamos Extension en vez de State
    },
    http::StatusCode,
    response::IntoResponse,
};
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use crate::auth::types::WsClaims;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tokio::{
    sync::mpsc,
    time::{sleep, Duration},
};
use tracing::info;
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
    let Some(token) = params.get("token") else {
        return Err(StatusCode::UNAUTHORIZED);
    };

    let secret = std::env::var("WS_JWT_SECRET").expect("WS_JWT_SECRET not set");
    let key = DecodingKey::from_secret(secret.as_bytes());

    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["ws"]);
    validation.set_issuer(&["leonobit"]);

    let decoded = match decode::<WsClaims>(token, &key, &validation) {
        Ok(data) => data.claims,
        Err(_) => return Err(StatusCode::UNAUTHORIZED),
    };

    // 👇 Aquí podrías loguear los claims, si querés debug
    tracing::info!("✅ Token validado para user {}", decoded.sub);

    Ok(ws.on_upgrade(move |socket| handle_socket(socket, peers)))
}

async fn handle_socket(socket: WebSocket, peers: PeerSet) {
    let peer_id = Uuid::new_v4().to_string();
    {
        let mut p = peers.lock().unwrap();
        p.insert(peer_id.clone());
    }
    info!("🔗 Nueva conexión: {}", &peer_id);

    let (mut sender, mut receiver) = socket.split();

    // mensajes automáticos cada 30s
    let (pm_tx, mut pm_rx) = mpsc::unbounded_channel::<String>();
    let peer_for_task = peer_id.clone();
    tokio::spawn(async move {
        let mut count = 1;
        loop {
            sleep(Duration::from_secs(30)).await;
            if pm_tx
                .send(format!(
                    "🤖 Mensaje automático #{count} desde el servidor - {peer_for_task}"
                ))
                .is_err()
            {
                break;
            }
            count += 1;
        }
    });

    loop {
        tokio::select! {
            Some(text) = pm_rx.recv() => {
                if sender.send(Message::Text(text)).await.is_err() { break; }
            }
            maybe_msg = receiver.next() => {
                match maybe_msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(offer) = serde_json::from_str::<Offer>(&text) {
                            info!("📩 Oferta recibida de {}: {}", peer_id, offer.sdp);
                            let answer = Answer { sdp: format!("Respuesta SDP simulada para {}", peer_id), r#type: "answer".into() };
                            let payload = serde_json::to_string(&answer).unwrap();
                            if sender.send(Message::Text(payload)).await.is_err() { break; }
                        } else {
                            info!("📥 Mensaje normal recibido: {}", text);
                            if sender.send(Message::Text(format!("📢 Eco: {}", text))).await.is_err() { break; }
                        }
                    }
                    Some(Ok(Message::Binary(_))) => {}
                    Some(Ok(Message::Ping(payload))) => { if sender.send(Message::Pong(payload)).await.is_err() { break; } }
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) => { info!("🔻 Cliente cerró: {}", peer_id); break; }
                    Some(Err(e)) => { info!("⚠️ Error en websocket {}: {:?}", peer_id, e); break; }
                    None => break,
                }
            }
        }
    }

    {
        let mut p = peers.lock().unwrap();
        p.remove(&peer_id);
    }
    info!("❌ Conexión cerrada: {}", peer_id);
}

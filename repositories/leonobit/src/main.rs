use axum::{routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, str::FromStr, sync::Arc};
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};
use webrtc::{
    api::APIBuilder,
    data_channel::data_channel_message::DataChannelMessage,
    ice_transport::{ice_connection_state::RTCIceConnectionState, ice_server::RTCIceServer},
    peer_connection::{
        configuration::RTCConfiguration,
        peer_connection_state::RTCPeerConnectionState,
        sdp::session_description::RTCSessionDescription,
    },
};
use tokio::time::{interval, Duration};

#[derive(Deserialize)]
struct OfferIn {
    sdp: String,
    #[allow(dead_code)]
    r#type: String, // "offer"
}

#[derive(Serialize)]
struct AnswerOut {
    sdp: String,
    #[serde(rename = "type")]
    kind: String, // "answer"
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .compact()
        .init();

    // CORS: permite tu frontend (o usa Any para pruebas locales)
    let origin = std::env::var("CORS_ORIGIN").unwrap_or_else(|_| "*".into());
    let cors = if origin == "*" {
        CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any)
    } else {
        let hv = http::HeaderValue::from_str(&origin).unwrap();
        CorsLayer::new().allow_origin(hv).allow_methods(Any).allow_headers(Any)
    };

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/offer", post(handle_offer))
        .layer(cors);

    let addr: SocketAddr = SocketAddr::from_str("0.0.0.0:8000").unwrap();
    info!("🚀 agent-ai escuchando en http://{addr}");
    axum::serve(tokio::net::TcpListener::bind(addr).await?, app).await?;
    Ok(())
}

async fn handle_offer(Json(body): Json<OfferIn>) -> Result<Json<AnswerOut>, axum::http::StatusCode> {
    // 1) API + ICE (STUN; TURN lo agregamos luego)
    let api = APIBuilder::new().build();
    let config = RTCConfiguration {
        ice_servers: vec![
            RTCIceServer {
                urls: vec!["stun:stun.l.google.com:19302".to_string()],
                ..Default::default()
            },
        ],
        ..Default::default()
    };

    // 2) PeerConnection
    let pc = Arc::new(api.new_peer_connection(config).await.map_err(|_| axum::http::StatusCode::INTERNAL_SERVER_ERROR)?);

    // Logs de estado
    {
        let pc2 = pc.clone();
        pc.on_peer_connection_state_change(Box::new(move |s: RTCPeerConnectionState| {
            let pc2 = pc2.clone();
            Box::pin(async move {
                info!("PC state: {s:?}");
                if matches!(s, RTCPeerConnectionState::Failed | RTCPeerConnectionState::Closed) {
                    let _ = pc2.close().await;
                }
            })
        })).await;

        pc.on_ice_connection_state_change(Box::new(move |s: RTCIceConnectionState| {
            Box::pin(async move { info!("ICE state: {s:?}") })
        })).await;
    }

    // 3) DataChannel entrante (el cliente lo crea)
    pc.on_data_channel(Box::new(move |dc| {
        Box::pin(async move {
            let label = dc.label().to_string();
            info!("DataChannel creado: {label}");

            dc.on_open(Box::new({
                let dc = dc.clone();
                move || {
                    let dc = dc.clone();
                    Box::pin(async move {
                        info!("DataChannel abierto: {label}");
                        let _ = dc.send_text("🎉 ¡Hola desde el servidor! La conexión bidireccional está establecida.").await;
                        let id = format!("peer_connection_{:p}", &dc);
                        let _ = dc.send_text(format!("🆔 ID de conexión: {id}")).await;

                        // mensajes automáticos cada 30s
                        let dc2 = dc.clone();
                        tokio::spawn(async move {
                            let mut n = 1;
                            let mut tick = interval(Duration::from_secs(30));
                            loop {
                                tick.tick().await;
                                if dc2.ready_state().await.is_open() {
                                    let _ = dc2
                                        .send_text(format!(
                                            "🤖 Mensaje automático #{} - {}",
                                            n,
                                            chrono::Local::now().format("%H:%M:%S")
                                        ))
                                        .await;
                                    n += 1;
                                } else {
                                    break;
                                }
                            }
                        });
                    })
                }
            })).await;

            dc.on_message(Box::new(move |msg: DataChannelMessage| {
                let dc = dc.clone();
                Box::pin(async move {
                    if let Ok(text) = std::str::from_utf8(&msg.data) {
                        info!("Mensaje recibido: {text}");
                        let _ = dc.send_text(format!("📢 Eco desde el servidor: {text}")).await;
                    }
                })
            })).await;

            dc.on_close(Box::new(move || {
                Box::pin(async move { info!("DataChannel cerrado: {label}") })
            })).await;
        })
    })).await;

    // 4) Offer -> Answer (sin trickle ICE: esperamos gather complete)
    let offer = RTCSessionDescription::offer(body.sdp);
    pc.set_remote_description(offer).await.map_err(|e| {
        error!("set_remote_description: {e}");
        axum::http::StatusCode::BAD_REQUEST
    })?;

    let answer = pc.create_answer(None).await.map_err(|e| {
        error!("create_answer: {e}");
        axum::http::StatusCode::INTERNAL_SERVER_ERROR
    })?;
    pc.set_local_description(answer).await.map_err(|e| {
        error!("set_local_description: {e}");
        axum::http::StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let gather_complete = pc.gathering_complete_promise().await;
    gather_complete.recv().await; // Answer incluirá candidatos

    let local = pc.local_description().await.ok_or(axum::http::StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(AnswerOut { sdp: local.sdp, kind: "answer".into() }))
}

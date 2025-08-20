// src/routes/mod.rs
use axum::{routing::get, Router};
use axum::routing::post;
use dashmap::DashSet;
use std::sync::Arc;

pub mod hello_routes;
pub mod labs;

use crate::auth::TokenProfile;
use tokio::sync::mpsc;            // ← canal
use crate::metrics::MetricEvent;  // ← tipo del canal 

#[derive(Clone)]
pub struct AppState {
    pub peers: Arc<DashSet<String>>,
    pub ws_secret: Arc<String>,
    pub allowed_ws_origins: Arc<Vec<String>>,
    /// Perfiles de validación JWT permitidos (iss/aud)
    pub profiles: Arc<Vec<TokenProfile>>,
    /// Canal para enviar eventos de métricas
    pub metrics_tx: mpsc::Sender<MetricEvent>,
}

impl AppState {
    pub fn new(ws_secret: String, allowed_ws_origins: Vec<String>, metrics_tx: mpsc::Sender<MetricEvent>) -> Self {
        // Agregá aquí todos los perfiles que quieras habilitar
        let profiles = vec![
            TokenProfile {
                iss: "leonobit",
                aud: "leonobit",
            }, // circuito Leonobit
            TokenProfile {
                iss: "lab-01",
                aud: "lab-ws-01-auth",
            },
            TokenProfile {
                iss: "lab-02",
                aud: "lab-ws-02-metrics",
            },
            TokenProfile {
                iss: "lab-03",
                aud: "lab-webrtc-03-metrics",
            },
            TokenProfile {
                iss: "lab-04",
                aud: "lab-webrtc-04-audio",
            },
            TokenProfile {
                iss: "lab-05",
                aud: "lab-webrtc-05-audio",
            },
        ];

        Self {
            peers: Arc::new(DashSet::new()),
            ws_secret: Arc::new(ws_secret),
            allowed_ws_origins: Arc::new(allowed_ws_origins),
            profiles: Arc::new(profiles),
            metrics_tx,
        }
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        // 👇 Rutas "hello" en la raíz (/, /user, /hello, /health)
        .merge(hello_routes::router())
        // 👇 Rutas WebSocket
        .route("/healthz", get(|| async { "ok" }))
        // 🔒 Endpoints WS por laboratorio
        .route("/ws/leonobit/offer", get(labs::leonobit::ws_handler))
        .route("/ws/lab/01/offer", get(labs::lab01::ws_handler))
        .route("/ws/lab/02/offer", get(labs::lab02::ws_handler))
        .route("/webrtc/lab/03/offer", post(labs::lab03::webrtc_offer))
        .route("/webrtc/lab/04/offer", post(labs::lab04::webrtc_offer_lab04))
        .route("/webrtc/lab/05/offer", post(labs::lab05::handle_lab05))
        // Estado global
        .with_state(state)
}

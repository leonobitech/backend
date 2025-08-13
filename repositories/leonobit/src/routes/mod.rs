use axum::{routing::get, Router};
use dashmap::DashSet;
use std::sync::Arc;

pub mod webrtc;
pub mod hello_routes;

#[derive(Clone)]
pub struct AppState {
    pub peers: Arc<DashSet<String>>,
    pub ws_secret: Arc<String>,
    pub allowed_ws_origins: Arc<Vec<String>>,
}

impl AppState {
    pub fn new(ws_secret: String, allowed_ws_origins: Vec<String>) -> Self {
        Self {
            peers: Arc::new(DashSet::new()),
            ws_secret: Arc::new(ws_secret),
            allowed_ws_origins: Arc::new(allowed_ws_origins),
        }
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        // 👇 Rutas "hello" en la raíz (/, /user, /hello, /health)
        .merge(hello_routes::router())
        // 👇 Rutas WebSocket
        .route("/healthz", get(|| async { "ok" }))
        .route("/ws/offer", get(webrtc::ws_handler))
        // Estado global
        .with_state(state)
}

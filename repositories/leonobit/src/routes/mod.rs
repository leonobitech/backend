use axum::{routing::get, Extension, Router};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};

pub mod hello_routes;
pub mod webrtc_routes;

use webrtc_routes::PeerSet;

pub fn app_routes() -> Router {
    let peers: PeerSet = Arc::new(Mutex::new(HashSet::<String>::new()));

    Router::new()
        .merge(hello_routes::router()) // Router<()> (sin state)
        .route("/ws/offer", get(webrtc_routes::ws_handler))
        .layer(Extension(peers)) // 👈 inyectamos PeerSet vía Extension
}

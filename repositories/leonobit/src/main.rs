use axum::{routing::get, Router};
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    // rutas mínimas
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/", get(|| async { "leonobit up" }));

    // bind en 0.0.0.0:8000
    let addr: SocketAddr = "0.0.0.0:8000".parse().unwrap();
    println!("leonobit listening on {addr}");

    // servidor que BLOQUEA hasta shutdown
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
        .await
        .unwrap();
}

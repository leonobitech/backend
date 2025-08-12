use axum::Router;
use std::net::SocketAddr;
use tokio::{net::TcpListener, signal};
use tower_http::trace::TraceLayer;

mod config;
mod routes;

pub async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cors = config::build_cors_from_env()?;

    let app: Router = routes::app_routes()
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    println!("Server listening on http://{addr}\n");

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app) // 👈 sin into_make_service
        .with_graceful_shutdown(async {
            let _ = signal::ctrl_c().await;
        })
        .await?;

    Ok(())
}

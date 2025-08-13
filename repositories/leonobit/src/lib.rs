use std::net::SocketAddr;
use tokio::{net::TcpListener, signal};
use tracing::info;

mod config;
mod routes;
pub mod auth;

pub async fn run() -> anyhow::Result<()> {
    // Carga settings (vars de entorno saneadas)
    let settings = config::settings::Settings::from_env()?;
    let cors = config::cors::build_cors_from_env()?;

    // Estado global
    let state = routes::AppState::new(settings.ws_jwt_secret, settings.allowed_ws_origins);

    // Router principal
    let app = routes::router(state.clone())
        .layer(cors)
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(tower_http::compression::CompressionLayer::new());

    let addr = SocketAddr::from(([0, 0, 0, 0], settings.port));
    info!("🚀 Server listening on http://{addr}");

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async { let _ = signal::ctrl_c().await; };

    #[cfg(unix)]
    let term = async {
        use tokio::signal::unix::{signal, SignalKind};
        let mut sigterm = signal(SignalKind::terminate()).expect("sigterm");
        sigterm.recv().await;
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();

    tokio::select! { _ = ctrl_c => {}, _ = term => {}, }
    tracing::warn!("🛑 shutdown signal received");
}

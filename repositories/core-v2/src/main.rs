//! Core-v2 application entry point

use std::net::SocketAddr;
use tokio::signal;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    core_v2::observability::init();

    info!("Starting core-v2...");

    // Load configuration
    let settings = core_v2::Settings::load()
        .unwrap_or_else(|_| {
            tracing::warn!("Failed to load settings from environment, using defaults");
            core_v2::Settings::default()
        });

    info!("Configuration loaded: {:?}", settings.server);

    // Create HTTP router
    let app = core_v2::presentation::http::create_router();

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], settings.server.port));
    info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("Server shutdown complete");

    Ok(())
}

/// Graceful shutdown signal handler
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("Shutdown signal received, starting graceful shutdown");
}

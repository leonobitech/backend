use axum::Router;
use routes::hello_routes;
use std::{env, net::SocketAddr, time::Duration};
use tokio::{signal, net::TcpListener};

use http::HeaderValue;
use tower_http::cors::{AllowHeaders, AllowMethods, CorsLayer};
use tower_http::trace::TraceLayer;

mod routes;

fn build_cors_from_env() -> Result<CorsLayer, Box<dyn std::error::Error>> {
    // ÚNICO origen permitido, requerido en producción
    let origin = env::var("CORS_ORIGIN")
        .expect("CORS_ORIGIN env var must be set (e.g., https://www.leonobitech.com)");
    let origin_value: HeaderValue = origin.parse()?; // valida formato header

    Ok(CorsLayer::new()
        .allow_origin(origin_value)
        .allow_methods(AllowMethods::any())
        .allow_headers(AllowHeaders::any())
        .max_age(Duration::from_secs(600)))
}

pub async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cors = build_cors_from_env()?;

    let app = Router::new()
        .merge(hello_routes())
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    println!("Server listening on http://{addr}\n");

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = signal::ctrl_c().await;
        })
        .await?;

    Ok(())
}

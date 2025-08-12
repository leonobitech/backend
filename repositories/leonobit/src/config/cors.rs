// src/config/cors.rs
use http::HeaderValue;
use std::{env, time::Duration};
use tower_http::cors::{AllowHeaders, AllowMethods, CorsLayer};

/// Construye configuración CORS a partir de la variable de entorno CORS_ORIGIN
pub fn build_cors_from_env() -> Result<CorsLayer, Box<dyn std::error::Error>> {
    let origin = env::var("CORS_ORIGIN")
        .expect("CORS_ORIGIN env var must be set (e.g., https://www.leonobitech.com)");
    let origin_value: HeaderValue = origin.parse()?;

    Ok(CorsLayer::new()
        .allow_origin(origin_value)
        .allow_methods(AllowMethods::any())
        .allow_headers(AllowHeaders::any())
        .max_age(Duration::from_secs(600)))
}

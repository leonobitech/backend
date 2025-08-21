use std::env;
use std::time::Duration;

use axum::http::HeaderValue;
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};

pub fn build_cors_from_env() -> anyhow::Result<CorsLayer> {
    let allow_origin = match env::var("CORS_ORIGIN") {
        Ok(val) => {
            // Soporta lista coma-separada. Si incluye "*", usar any().
            let raw_items: Vec<String> = val
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();

            if raw_items.is_empty() || raw_items.iter().any(|s| s == "*") {
                AllowOrigin::any()
            } else {
                let items: Vec<HeaderValue> = raw_items
                    .into_iter()
                    .map(|s| s.parse::<HeaderValue>())
                    .collect::<Result<Vec<_>, _>>()?;
                AllowOrigin::list(items)
            }
        }
        Err(_) => AllowOrigin::any(), // fallback dev
    };

    Ok(CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_methods(AllowMethods::any())
        .allow_headers(AllowHeaders::any())
        .max_age(Duration::from_secs(600)))
}

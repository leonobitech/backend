//! HTTP presentation layer
//!
//! Axum routes, middleware, and extractors

pub mod extractors;
pub mod middleware;
pub mod routes;

use axum::{routing::get, Router};

/// Health check handler
async fn health_check() -> &'static str {
    "OK"
}

/// Create the HTTP router
pub fn create_router() -> Router {
    Router::new().route("/health", get(health_check))
}

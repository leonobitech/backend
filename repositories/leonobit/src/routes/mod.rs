use axum::{
    routing::{get},
    Router,
};

use hello_routes::{hello_params, hello_user, hello_world};

mod hello_routes;

pub fn hello_routes() -> Router {
    Router::new()
        .route("/", get(hello_world))
        .route("/user", get(hello_user))
        .route("/hello", get(hello_params))
        .route("/health", get(|| async { "ok" }))
}
// src/routes/hello_routes.rs
use axum::{
    extract::Query,
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct User {
    name: String,
    age: u32,
}
#[derive(Debug, Serialize)]
struct Response {
    user: User,
}

pub async fn hello_world() -> impl IntoResponse {
    Html("<strong>Hello World</strong>")
}

pub async fn hello_user() -> impl IntoResponse {
    let user = User {
        name: "John Doe".into(),
        age: 30,
    };
    axum::Json(Response { user })
}

#[derive(Debug, Deserialize)]
pub struct HelloParams {
    pub name: Option<String>,
}

pub async fn hello_params(Query(params): Query<HelloParams>) -> impl IntoResponse {
    let name = params.name.as_deref().unwrap_or("Params");
    Html(format!("<strong>Hello {name}!</strong>"))
}

// 👉 expone un Router desde este módulo
pub fn router() -> Router {
    Router::new()
        .route("/", get(hello_world))
        .route("/user", get(hello_user))
        .route("/hello", get(hello_params))
        .route("/health", get(|| async { "ok" }))
}

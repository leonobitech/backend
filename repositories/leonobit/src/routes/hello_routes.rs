// src/routes/hello_routes.rs
use axum::extract::Query;
use axum::response::{Html, IntoResponse};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::routes::AppState;

#[derive(Debug, Serialize)]
struct User {
  name: String,
  age: u32,
}

#[derive(Debug, Serialize)]
struct Resp {
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
  Json(Resp { user })
}

#[derive(Debug, Deserialize)]
pub struct HelloParams {
  pub name: Option<String>,
}

pub async fn hello_params(Query(params): Query<HelloParams>) -> impl IntoResponse {
  let name = params.name.as_deref().unwrap_or("Params");
  Html(format!("<strong>Hello {name}!</strong>"))
}

/// 👉 Router tipado con AppState para que pueda mergearse con el principal
pub fn router() -> Router<AppState> {
  Router::new()
    .route("/", get(hello_world))
    .route("/user", get(hello_user))
    .route("/hello", get(hello_params))
    .route("/health", get(|| async { "ok" }))
}

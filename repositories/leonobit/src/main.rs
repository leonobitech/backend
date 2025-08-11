use axum::{routing::{get, post}, Router, Json};
use tower_http::cors::{CorsLayer, Any};
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    // CORS abierto para pruebas
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    // Rutas mínimas
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/offer", post(dummy_offer))
        .layer(cors);

    let addr: SocketAddr = "0.0.0.0:8000".parse().unwrap();
    println!("leonobit listening on {addr}");

    // ESTO BLOQUEA HASTA SHUTDOWN
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
        .await
        .unwrap();
}

#[derive(serde::Deserialize)]
struct OfferIn { sdp: String, #[allow(dead_code)] r#type: String }

#[derive(serde::Serialize)]
struct AnswerOut { sdp: String, #[serde(rename="type")] kind: String }

async fn dummy_offer(Json(_): Json<OfferIn>) -> Json<AnswerOut> {
    Json(AnswerOut { sdp: "DUMMY".into(), kind: "answer".into() })
}

// src/routes/mod.rs
use std::path::Path;
use std::sync::Arc;

use axum::routing::{get, post};
use axum::Router;
use dashmap::DashSet;

pub mod ai_health;
pub mod hello_routes;
pub mod labs;
pub mod leonobit;

use reqwest::Client as HttpClient;
use tokio::sync::mpsc;

use crate::auth::TokenProfile;
use crate::metrics::rtt::MetricEvent;
#[derive(Clone)]
pub struct AppState {
  pub peers: Arc<DashSet<String>>,
  pub ws_secret: Arc<String>,
  pub allowed_ws_origins: Arc<Vec<String>>,
  /// Perfiles de validación JWT permitidos (iss/aud)
  pub profiles: Arc<Vec<TokenProfile>>,
  /// Canal para enviar eventos de métricas
  pub metrics_tx: mpsc::Sender<MetricEvent>,
  /// HTTP client reutilizable (timeouts, pooling)
  pub http: HttpClient,
  /// Ruta al modelo de Whisper (para health/checks)
  pub whisper_model_path: String,
  /// Flag “rápido” de disponibilidad de Whisper (archivo existe / init ok)
  pub whisper_ready: bool,
}

impl AppState {
  pub fn new(
    ws_secret: String,
    allowed_ws_origins: Vec<String>,
    metrics_tx: mpsc::Sender<MetricEvent>,
    whisper_model_path: String,
  ) -> Self {
    // Agregá aquí todos los perfiles que quieras habilitar
    let profiles = vec![
      TokenProfile {
        iss: "leonobit",
        aud: "leonobit",
      }, // circuito Leonobit
      TokenProfile {
        iss: "lab-01",
        aud: "lab-ws-01-auth",
      },
      TokenProfile {
        iss: "lab-02",
        aud: "lab-ws-02-metrics",
      },
      TokenProfile {
        iss: "lab-03",
        aud: "lab-webrtc-03-metrics",
      },
      TokenProfile {
        iss: "lab-04",
        aud: "lab-webrtc-04-audio",
      },
      TokenProfile {
        iss: "lab-05",
        aud: "lab-webrtc-05-audio",
      },
    ];
    // HTTP client con timeout razonable y UA identificable
    let http = HttpClient::builder()
      .timeout(std::time::Duration::from_secs(5))
      .user_agent("leonobit/healthcheck")
      .build()
      .expect("http client");

    // Chequeo rápido: ¿existe el modelo de Whisper?
    let whisper_ready = Path::new(&whisper_model_path).exists();

    Self {
      peers: Arc::new(DashSet::new()),
      ws_secret: Arc::new(ws_secret),
      allowed_ws_origins: Arc::new(allowed_ws_origins),
      profiles: Arc::new(profiles),
      metrics_tx,
      http,
      whisper_model_path,
      whisper_ready,
    }
  }
}

pub fn router(state: AppState) -> Router {
  Router::new()
    // 👇 Rutas "hello" en la raíz (/, /user, /hello, /health)
    .merge(hello_routes::router())
    .route("/healthz", get(|| async { "ok" }))
    // ---- NUEVOS health endpoints (OpenAI, ElevenLabs y Whisper) ----
    .route("/health/ai/openai", get(ai_health::health_openai))
    .route("/health/ai/elevenlabs", get(ai_health::health_elevenlabs))
    .route("/health/ai/whisper", get(ai_health::health_whisper))
    .route("/health/ai", get(ai_health::health_ai))
    // ---- WS/WEBRTC existentes ----
    .route("/ws/leonobit/offer", get(leonobit::ws_handler))
    .route("/ws/lab/01/offer", get(labs::lab01::ws_handler))
    .route("/ws/lab/02/offer", get(labs::lab02::ws_handler))
    .route("/webrtc/lab/03/offer", post(labs::lab03::webrtc_offer))
    .route("/webrtc/lab/04/offer", post(labs::lab04::webrtc_offer_lab04))
    .route("/webrtc/lab/05/offer", post(labs::lab05::handle_lab05))
    // Estado global
    .with_state(state)
}

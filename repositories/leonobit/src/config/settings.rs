use std::path::Path;

use anyhow::{Context, Result};

#[derive(Clone, Debug)]
pub struct Settings {
    pub port: u16,
    pub ws_jwt_secret: String,
    pub allowed_ws_origins: Vec<String>,
    pub whisper_model_path: String,
}

impl Settings {
    const DEFAULT_PORT: u16 = 8000;
    const DEFAULT_WHISPER_MODEL_PATH: &'static str = "/app/models/ggml-base.en.bin";

    pub fn from_env() -> Result<Self> {
        // Cargar .env si existe (opcional)
        let _ = dotenvy::dotenv();

        // Puerto
        let port = std::env::var("PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(Self::DEFAULT_PORT);

        // Secret para WS
        let ws_jwt_secret = std::env::var("WS_JWT_SECRET").context("WS_JWT_SECRET is required")?;

        // Orígenes permitidos para WS
        let allowed_ws_origins = std::env::var("ALLOWED_WS_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(|s| s.trim().trim_end_matches('/').to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();

        if allowed_ws_origins.is_empty() {
            tracing::warn!("ALLOWED_WS_ORIGINS is empty → WS origin check will be permissive");
        }

        // Ruta al modelo Whisper
        let whisper_model_path = std::env::var("WHISPER_MODEL_PATH")
            .unwrap_or_else(|_| Self::DEFAULT_WHISPER_MODEL_PATH.to_string());

        if !Path::new(&whisper_model_path).exists() {
            tracing::warn!("WHISPER_MODEL_PATH not found at '{}'", whisper_model_path);
        }

        Ok(Self {
            port,
            ws_jwt_secret,
            allowed_ws_origins,
            whisper_model_path,
        })
    }
}

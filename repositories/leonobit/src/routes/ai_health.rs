// Whisper
use std::env;
use std::path::Path;

// OpenAI
use async_openai::{config::OpenAIConfig, Client as OpenAIClient};
use axum::http::StatusCode;
use axum::response::IntoResponse;
// ElevenLabs
use reqwest::Client as HttpClient;
use tracing::{error, info};
use whisper_rs::{WhisperContext, WhisperContextParameters};

/* ---------- /health/ai/openai ---------- */
pub async fn health_openai() -> impl IntoResponse {
    let client: OpenAIClient<OpenAIConfig> = OpenAIClient::new();
    match client.models().list().await {
        Ok(_) => {
            info!("openai: ok");
            (StatusCode::OK, "openai: ok".to_string())
        }
        Err(e) => {
            error!("openai error: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("openai error: {e}"),
            )
        }
    }
}

/* ---------- /health/ai/elevenlabs ---------- */
pub async fn health_elevenlabs() -> impl IntoResponse {
    let api_key = match env::var("ELEVENLABS_API_KEY") {
        Ok(v) if !v.is_empty() => v,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                "elevenlabs: missing ELEVENLABS_API_KEY".to_string(),
            )
        }
    };

    let http = HttpClient::new();
    let res = http
        .get("https://api.elevenlabs.io/v1/voices")
        .header("xi-api-key", api_key)
        .send()
        .await;

    match res {
        Ok(resp) if resp.status().is_success() => {
            info!("elevenlabs: ok");
            (StatusCode::OK, "elevenlabs: ok".to_string())
        }
        Ok(resp) => {
            let code = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!("elevenlabs error {code}: {body}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("elevenlabs error {code}: {body}"),
            )
        }
        Err(e) => {
            error!("elevenlabs request error: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("elevenlabs request error: {e}"),
            )
        }
    }
}

/* ---------- /health/ai/whisper ---------- */
pub async fn health_whisper() -> impl IntoResponse {
    let model_path = match env::var("WHISPER_MODEL_PATH") {
        Ok(p) if !p.is_empty() => p,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                "whisper: missing WHISPER_MODEL_PATH".to_string(),
            )
        }
    };

    let p = Path::new(&model_path);
    if !p.exists() {
        return (
            StatusCode::NOT_FOUND,
            format!("whisper: model not found at {model_path}"),
        );
    }

    match WhisperContext::new_with_params(&model_path, WhisperContextParameters::default()) {
        Ok(_) => {
            info!("whisper: ok ({model_path})");
            (StatusCode::OK, "whisper: ok".to_string())
        }
        Err(e) => {
            error!("whisper error: {e:?}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("whisper error: {e:?}"),
            )
        }
    }
}

/* ---------- /health/ai ---------- */
pub async fn health_ai() -> impl IntoResponse {
    if let Err(msg) = one_openai().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, msg);
    }
    if let Err(msg) = one_elevenlabs().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, msg);
    }
    if let Err(msg) = one_whisper().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, msg);
    }
    (StatusCode::OK, "ai: ok".to_string())
}

async fn one_openai() -> Result<(), String> {
    let client: OpenAIClient<OpenAIConfig> = OpenAIClient::new();
    client
        .models()
        .list()
        .await
        .map_err(|e| format!("openai: {e}"))?;
    Ok(())
}

async fn one_elevenlabs() -> Result<(), String> {
    let api_key = std::env::var("ELEVENLABS_API_KEY")
        .map_err(|_| "missing ELEVENLABS_API_KEY".to_string())?;
    let http = HttpClient::new();
    let r = http
        .get("https://api.elevenlabs.io/v1/voices")
        .header("xi-api-key", api_key)
        .send()
        .await
        .map_err(|e| format!("elevenlabs req: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("elevenlabs status: {}", r.status()));
    }
    Ok(())
}

async fn one_whisper() -> Result<(), String> {
    let path = std::env::var("WHISPER_MODEL_PATH")
        .map_err(|_| "missing WHISPER_MODEL_PATH".to_string())?;
    if !std::path::Path::new(&path).exists() {
        return Err(format!("model not found: {path}"));
    }
    WhisperContext::new_with_params(&path, WhisperContextParameters::default())
        .map_err(|e| format!("whisper init: {e:?}"))?;
    Ok(())
}

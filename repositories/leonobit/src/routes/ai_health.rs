use async_openai::config::OpenAIConfig;
use async_openai::Client as OpenAIClient;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;

use crate::routes::AppState;

/* ---------- /health/ai/openai ---------- */
pub async fn health_openai() -> impl IntoResponse {
    let client: OpenAIClient<OpenAIConfig> = OpenAIClient::new();
    match client.models().list().await {
        Ok(_) => (StatusCode::OK, "openai: ok".to_string()),
        Err(e) => (StatusCode::BAD_GATEWAY, format!("openai: {e}")),
    }
}

/* ---------- /health/ai/elevenlabs ---------- */
pub async fn health_elevenlabs(State(state): State<AppState>) -> impl IntoResponse {
    let api_key = match std::env::var("ELEVENLABS_API_KEY") {
        Ok(v) if !v.is_empty() => v,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                "elevenlabs: missing ELEVENLABS_API_KEY".into(),
            )
        }
    };

    let res = state
        .http
        .get("https://api.elevenlabs.io/v1/voices")
        .header("xi-api-key", api_key)
        .send()
        .await;

    match res {
        Ok(resp) if resp.status().is_success() => (StatusCode::OK, "elevenlabs: ok".into()),
        Ok(resp) => (
            StatusCode::BAD_GATEWAY,
            format!("elevenlabs upstream {}", resp.status()),
        ),
        Err(_) => (StatusCode::BAD_GATEWAY, "elevenlabs network error".into()),
    }
}

/* ---------- /health/ai/whisper ---------- */
pub async fn health_whisper(State(state): State<AppState>) -> impl IntoResponse {
    if !state.whisper_ready {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            format!("whisper: model not ready ({})", state.whisper_model_path),
        );
    }
    (
        StatusCode::OK,
        format!("whisper: ok ({})", state.whisper_model_path),
    )
}

/* ---------- /health/ai (aggregado) ---------- */
pub async fn health_ai(State(state): State<AppState>) -> impl IntoResponse {
    // openai (no necesita state)
    if let Err(e) = async {
        let c: OpenAIClient<OpenAIConfig> = OpenAIClient::new();
        c.models().list().await.map(|_| ())
    }
    .await
    {
        return (StatusCode::BAD_GATEWAY, format!("openai: {e}"));
    }

    // elevenlabs con client reutilizable
    if let Err((code, msg)) = async {
        let api_key = std::env::var("ELEVENLABS_API_KEY")
            .map_err(|_| (StatusCode::BAD_REQUEST, "missing ELEVENLABS_API_KEY".into()))?;
        let r = state
            .http
            .get("https://api.elevenlabs.io/v1/voices")
            .header("xi-api-key", api_key)
            .send()
            .await
            .map_err(|_| (StatusCode::BAD_GATEWAY, "elevenlabs network error".into()))?;
        if !r.status().is_success() {
            return Err((
                StatusCode::BAD_GATEWAY,
                format!("elevenlabs upstream {}", r.status()),
            ));
        }
        Ok::<_, (StatusCode, String)>(())
    }
    .await
    {
        return (code, msg);
    }

    // whisper por flag rápido
    if !state.whisper_ready {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            format!("whisper: model not ready ({})", state.whisper_model_path),
        );
    }

    (StatusCode::OK, "ai: ok".into())
}

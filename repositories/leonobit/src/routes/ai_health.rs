use async_openai::config::OpenAIConfig;
use async_openai::Client as OpenAIClient;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use tracing::{error, info, instrument, warn};

use crate::routes::AppState;

/* ---------- /health/ai/openai ---------- */
#[instrument(name = "health_openai", skip_all)]
pub async fn health_openai() -> impl IntoResponse {
  let client: OpenAIClient<OpenAIConfig> = OpenAIClient::new();
  match client.models().list().await {
    Ok(_) => {
      info!("openai: ok");
      (StatusCode::OK, "openai: ok".to_string())
    }
    Err(e) => {
      warn!(err = %e, "openai: failed");
      (StatusCode::BAD_GATEWAY, format!("openai: {e}"))
    }
  }
}

/* ---------- /health/ai/elevenlabs ---------- */
#[instrument(name = "health_elevenlabs", skip(state))]
pub async fn health_elevenlabs(State(state): State<AppState>) -> impl IntoResponse {
  let api_key = match std::env::var("ELEVENLABS_API_KEY") {
    Ok(v) if !v.is_empty() => v,
    _ => {
      warn!("elevenlabs: missing ELEVENLABS_API_KEY");
      return (StatusCode::BAD_REQUEST, "elevenlabs: missing ELEVENLABS_API_KEY".into());
    }
  };

  let res = state
    .http
    .get("https://api.elevenlabs.io/v1/voices")
    .header("xi-api-key", api_key)
    .send()
    .await;

  match res {
    Ok(resp) if resp.status().is_success() => {
      info!("elevenlabs: ok");
      (StatusCode::OK, "elevenlabs: ok".into())
    }
    Ok(resp) => {
      warn!(status = %resp.status(), "elevenlabs: upstream non-2xx");
      (
        StatusCode::BAD_GATEWAY,
        format!("elevenlabs upstream {}", resp.status()),
      )
    }
    Err(e) => {
      error!(err = %e, "elevenlabs: network error");
      (StatusCode::BAD_GATEWAY, "elevenlabs network error".into())
    }
  }
}

/* ---------- /health/ai/whisper ---------- */
#[instrument(name = "health_whisper", skip(state))]
pub async fn health_whisper(State(state): State<AppState>) -> impl IntoResponse {
  if !state.whisper_ready {
    warn!(path = %state.whisper_model_path, "whisper: not ready");
    return (
      StatusCode::SERVICE_UNAVAILABLE,
      format!("whisper: model not ready ({})", state.whisper_model_path),
    );
  }
  info!(path = %state.whisper_model_path, "whisper: ok");
  (StatusCode::OK, format!("whisper: ok ({})", state.whisper_model_path))
}

/* ---------- /health/ai (aggregado) ---------- */
#[instrument(name = "health_ai", skip(state))]
pub async fn health_ai(State(state): State<AppState>) -> impl IntoResponse {
  // openai
  if let Err(e) = async {
    let c: OpenAIClient<OpenAIConfig> = OpenAIClient::new();
    c.models().list().await.map(|_| ())
  }
  .await
  {
    warn!(err = %e, "health_ai: openai failed");
    return (StatusCode::BAD_GATEWAY, format!("openai: {e}"));
  }

  // elevenlabs
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
      return Err((StatusCode::BAD_GATEWAY, format!("elevenlabs upstream {}", r.status())));
    }
    Ok::<_, (StatusCode, String)>(())
  }
  .await
  {
    warn!(%code, %msg, "health_ai: elevenlabs failed");
    return (code, msg);
  }

  // whisper
  if !state.whisper_ready {
    warn!(path = %state.whisper_model_path, "health_ai: whisper not ready");
    return (
      StatusCode::SERVICE_UNAVAILABLE,
      format!("whisper: model not ready ({})", state.whisper_model_path),
    );
  }

  info!("health_ai: ok");
  (StatusCode::OK, "ai: ok".into())
}

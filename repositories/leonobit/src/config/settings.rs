use anyhow::Context;

#[derive(Clone, Debug)]
pub struct Settings {
    pub port: u16,
    pub ws_jwt_secret: String,
    pub allowed_ws_origins: Vec<String>,
}

impl Settings {
    pub fn from_env() -> anyhow::Result<Self> {
        let port = std::env::var("PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(8000);

        let ws_jwt_secret = std::env::var("WS_JWT_SECRET").context("WS_JWT_SECRET is required")?;

        // Para validar Origin en WS (no es CORS; aplica al upgrade)
        // Ej: "https://www.leonobitech.com,https://leonobitech.com"
        let allowed_ws_origins = std::env::var("ALLOWED_WS_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();

        if allowed_ws_origins.is_empty() {
            tracing::warn!("ALLOWED_WS_ORIGINS empty → WS origin check will be permissive");
        }

        Ok(Self {
            port,
            ws_jwt_secret,
            allowed_ws_origins,
        })
    }
}

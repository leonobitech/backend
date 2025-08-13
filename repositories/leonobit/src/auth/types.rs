use serde::{Deserialize, Serialize};

// WebSocket JWT claims
#[derive(Debug, Serialize, Deserialize)]
pub struct WsClaims {
    pub sub: String,
    pub tid: String,
    pub aud: String,
    pub role: Option<String>,
    pub email: Option<String>,
    pub exp: usize,
    pub iss: String,
    pub jti: String,
}

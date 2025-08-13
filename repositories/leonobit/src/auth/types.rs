use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsClaims {
    pub sub: String,
    pub tid: String,
    pub aud: String,     // "ws"
    pub iss: String,     // "leonobit"
    pub jti: String,
    pub exp: u64,        // portable
    pub role: Option<String>,
    pub email: Option<String>,
    pub iat: Option<u64>,
}

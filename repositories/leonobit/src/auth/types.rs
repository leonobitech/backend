// src/auth/types.rs
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct WsClaims {
    pub sub: String,
    pub exp: usize,
    pub iat: Option<usize>,
    pub jti: Option<String>,

    // custom (opcionales según el token)
    pub tid: Option<String>,   // "leonobit" | "lab"
    pub label: Option<String>, // "leonobit" | "lab-01-ws-auth"
    pub path: Option<String>,  // "/leonobit" | "/lab/01-ws-auth"
    pub role: Option<String>,
    pub email: Option<String>,
}

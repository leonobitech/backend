use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use crate::auth::types::WsClaims;

pub fn validate_ws_token(token: &str, secret: &str) -> Result<WsClaims, String> {
    let key = DecodingKey::from_secret(secret.as_bytes());

    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["ws"]);
    validation.set_issuer(&["leonobit"]);

    decode::<WsClaims>(token, &key, &validation)
        .map(|d| d.claims)
        .map_err(|e| format!("JWT inválido: {}", e))
}

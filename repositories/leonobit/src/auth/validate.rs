use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use crate::auth::types::WsClaims;

pub fn validate_ws_token(token: &str, secret: &str) -> Result<WsClaims, String> {
    if token.trim().is_empty() {
        return Err("JWT ausente".into());
    }
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["ws"]);
    validation.set_issuer(&["leonobit"]);
    validation.leeway = 5;

    decode::<WsClaims>(token, &DecodingKey::from_secret(secret.as_bytes()), &validation)
        .map(|d| d.claims)
        .map_err(|e| match e.kind() {
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => "JWT expirado".into(),
            jsonwebtoken::errors::ErrorKind::InvalidAudience   => "Audience inválido".into(),
            jsonwebtoken::errors::ErrorKind::InvalidIssuer     => "Issuer inválido".into(),
            _ => format!("JWT inválido: {e}"),
        })
}

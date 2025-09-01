// src/auth/validate.rs
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

use crate::auth::types::WsClaims;

/// Perfil permitido (issuer + audience)
#[derive(Clone, Copy, Debug)]
pub struct TokenProfile {
  pub iss: &'static str,
  pub aud: &'static str,
}

/// Valida el JWT contra cualquiera de los perfiles permitidos usando HS256.
/// Un único secreto (WS_JWT_SECRET) y devuelve WsClaims.
pub fn validate_ws_token_multi(token: &str, secret: &str, profiles: &[TokenProfile]) -> Result<WsClaims, String> {
  if token.trim().is_empty() {
    return Err("JWT ausente".into());
  }

  let mut last_err: Option<String> = None;
  for p in profiles {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&[p.aud]);
    validation.set_issuer(&[p.iss]); // jsonwebtoken >= 9
    validation.leeway = 5;

    match decode::<WsClaims>(token, &DecodingKey::from_secret(secret.as_bytes()), &validation) {
      Ok(data) => return Ok(data.claims),
      Err(e) => {
        use jsonwebtoken::errors::ErrorKind::*;
        let msg = match e.kind() {
          ExpiredSignature => "JWT expirado".into(),
          InvalidAudience => format!("Audience inválido (esperado: {})", p.aud),
          InvalidIssuer => format!("Issuer inválido (esperado: {})", p.iss),
          _ => format!("JWT inválido: {e}"),
        };
        last_err = Some(msg);
      }
    }
  }

  Err(last_err.unwrap_or_else(|| "JWT inválido para los perfiles permitidos".into()))
}

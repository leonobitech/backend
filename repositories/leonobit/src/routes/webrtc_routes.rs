use jsonwebtoken::{decode, dangerous_insecure_decode, Algorithm, DecodingKey, Validation};

pub async fn ws_handler(
    Extension(peers): Extension<PeerSet>,
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    debug!("📡 Nueva solicitud WS en /ws/offer con params: {:?}", params);

    let Some(token) = params.get("token") else {
        warn!("⚠️ WS rechazado: falta token en query params");
        return Err(StatusCode::UNAUTHORIZED);
    };

    // 🔍 Log completo del token recibido
    info!("🔍 Token recibido (sin validar): {}", token);

    // Decodificar sin validar firma para inspeccionar claims
    match dangerous_insecure_decode::<serde_json::Value>(token) {
        Ok(data) => info!("📜 Claims decodificados sin validar: {:?}", data.claims),
        Err(e) => warn!("⚠️ No se pudo decodificar sin validar: {:?}", e),
    }

    let secret = match std::env::var("WS_JWT_SECRET") {
        Ok(v) => v,
        Err(_) => {
            error!("❌ WS_JWT_SECRET no está configurado");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    let key = DecodingKey::from_secret(secret.as_bytes());

    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["ws"]);
    validation.set_issuer(&["leonobit"]);

    match decode::<WsClaims>(token, &key, &validation) {
        Ok(data) => {
            info!("✅ Token WS válido: sub={} role={:?}", data.claims.sub, data.claims.role);
            Ok(ws.on_upgrade(move |socket| handle_socket(socket, peers)))
        }
        Err(e) => {
            warn!("⚠️ WS rechazado: token inválido - {}", e);
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

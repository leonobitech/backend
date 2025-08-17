// src/main.rs
use leonobit::run;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 📦 Cargar .env si existe (solo en desarrollo normalmente)
    dotenvy::dotenv().ok();

    // RUST_LOG=info,tower_http=info cargo run
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info,tower_http=info".into())
        // ↓ Silenciar ruido de teardown:
        .add_directive("webrtc_ice::agent::agent_internal=error".parse().unwrap())
        .add_directive("webrtc_mdns::conn=error".parse().unwrap());
        // Si también te molestan los SRTP cerrados:
        // .add_directive("webrtc::peer_connection::peer_connection_internal=error".parse().unwrap())

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .init();

    tracing::info!("🚀 leonobit backend starting…");
    run().await
}

// ----------------------------------------------------------------------------------------
// NOTA PARA DESARROLLO LOCAL:
// Este backend requiere la variable de entorno CORS_ORIGIN para permitir
// solicitudes desde el frontend. En producción, este valor se establece en Docker.
//
// Para pruebas locales, exporta el CORS_ORIGIN apuntando a tu dominio en producción
// (o a la URL desde la que harás la prueba) y ejecuta el servidor:
//
//   export CORS_ORIGIN="https://www.leonobitech.com"
//   cargo run
//
// Luego abre el archivo `ws-test-local.html` en tu navegador para probar la conexión
// WebSocket localmente.
//
// Ejemplo:
//   - Servidor: ws://localhost:8000/ws/offer
//   - Frontend: archivo HTML local usando esa URL:
//    http://localhost:5500/repositories/leonobit/ws-test-local.html (usando Live Server)
// ----------------------------------------------------------------------------------------

// src/main.rs
use leonobit::run;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // RUST_LOG=info cargo run
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    run().await?;
    Ok(())
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

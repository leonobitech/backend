//! Observability: Tracing, metrics, and structured logging
//!
//! Provides comprehensive observability for the application using the `tracing` ecosystem

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Initialize tracing subscriber for structured logging
///
/// # Environment Variables
///
/// - `RUST_LOG`: Sets the log level (e.g., "info", "debug", "trace")
///
/// # Examples
///
/// ```no_run
/// core_v2::observability::init();
/// ```
pub fn init() {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    tracing::info!("Tracing initialized");
}

/// Initialize tracing with OpenTelemetry export
///
/// For production environments that need telemetry export
#[allow(dead_code)]
pub fn init_with_telemetry(
    service_name: &str,
    otlp_endpoint: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    use opentelemetry::trace::TracerProvider;
    use opentelemetry_otlp::WithExportConfig;
    use opentelemetry_sdk::trace::Config;

    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(
            opentelemetry_otlp::new_exporter()
                .tonic()
                .with_endpoint(otlp_endpoint),
        )
        .with_trace_config(
            Config::default().with_resource(opentelemetry_sdk::Resource::new(vec![
                opentelemetry::KeyValue::new("service.name", service_name.to_string()),
            ])),
        )
        .install_batch(opentelemetry_sdk::runtime::Tokio)?;

    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with(tracing_subscriber::fmt::layer().json())
        .with(tracing_opentelemetry::layer().with_tracer(tracer.tracer("core-v2")))
        .init();

    tracing::info!("Tracing with OpenTelemetry initialized");

    Ok(())
}

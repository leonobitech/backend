// src/metrics.rs
use hdrhistogram::Histogram;
use tokio::sync::{mpsc, watch};
use tokio::time::{interval, Duration};
use tracing::{info, warn};

#[derive(Debug, Clone)]
pub enum MetricEvent {
  /// Latencia/RTT en microsegundos (μs)
  RttMicros(u64),
}

/// Versión simple (compat con tu código): 2s de ventana, máx 5s de RTT.
pub fn start_metrics_aggregator() -> mpsc::Sender<MetricEvent> {
  start_metrics_aggregator_with(Duration::from_secs(2), 5_000 /* ms */).0
}

/// Versión configurable: retorna (tx, shutdown_tx) por si querés cerrar ordenado.
pub fn start_metrics_aggregator_with(
  window: Duration,
  max_rtt_ms: u64,
) -> (mpsc::Sender<MetricEvent>, watch::Sender<bool>) {
  let (tx, mut rx) = mpsc::channel::<MetricEvent>(1024);
  let (shutdown_tx, mut shutdown_rx) = watch::channel(false);

  // trackeamos hasta max_rtt_ms en μs
  let max_us = max_rtt_ms.saturating_mul(1_000);

  tokio::spawn(async move {
    let mut hist = Histogram::<u64>::new_with_max(max_us, 3).expect("histogram with max");
    let mut tick = interval(window);
    let mut count: u64 = 0;
    let mut sum_us: u128 = 0; // para media

    loop {
      tokio::select! {
          _ = tick.tick() => {
              if !hist.is_empty() {
                  let min = hist.min() as f64 / 1000.0;
                  let p50 = hist.value_at_quantile(0.50) as f64 / 1000.0;
                  let p90 = hist.value_at_quantile(0.90) as f64 / 1000.0;
                  let p95 = hist.value_at_quantile(0.95) as f64 / 1000.0;
                  let p99 = hist.value_at_quantile(0.99) as f64 / 1000.0;
                  let max = hist.max() as f64 / 1000.0;
                  let mean = if count > 0 {
                      (sum_us as f64 / count as f64) / 1000.0
                  } else { 0.0 };

                  info!(
                      "RTT ms → min:{min:.2} mean:{mean:.2} p50:{p50:.2} p90:{p90:.2} p95:{p95:.2} p99:{p99:.2} max:{max:.2} (n={})",
                      hist.len()
                  );

                  // reset de ventana
                  hist.reset();
                  count = 0;
                  sum_us = 0;
              }
          }
          msg = rx.recv() => match msg {
              Some(MetricEvent::RttMicros(mut us)) => {
                  if us > max_us {
                      warn!("RTT fuera de rango ({} μs) > max {} μs; clamp", us, max_us);
                      us = max_us;
                  }
                  // si falla por algún motivo, lo ignoramos
                  let _ = hist.record(us);
                  count += 1;
                  sum_us = sum_us.saturating_add(us as u128);
              }
              None => break, // canal cerrado
          },
          changed = shutdown_rx.changed() => {
              if changed.is_ok() && *shutdown_rx.borrow() {
                  break;
              }
          }
      }
    }
  });

  (tx, shutdown_tx)
}

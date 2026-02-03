// src/metrics.rs
use hdrhistogram::Histogram;
use tokio::sync::mpsc;
use tokio::time::{interval, Duration};
use tracing::{info, warn};

#[derive(Debug, Clone)]
pub enum MetricEvent {
  /// Latencia/RTT en microsegundos (μs)
  RttMicros(u64),
}

/// Arranca el agregador de métricas RTT: ventana de 2s, máx 5s de RTT.
/// El task se detiene automáticamente cuando todos los `Sender` se dropean.
pub fn start_metrics_aggregator() -> mpsc::Sender<MetricEvent> {
  let (tx, mut rx) = mpsc::channel::<MetricEvent>(1024);

  let max_rtt_ms: u64 = 5_000;
  let max_us = max_rtt_ms.saturating_mul(1_000);

  tokio::spawn(async move {
    let mut hist = Histogram::<u64>::new_with_max(max_us, 3).expect("histogram with max");
    let mut tick = interval(Duration::from_secs(2));
    let mut count: u64 = 0;
    let mut sum_us: u128 = 0;

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
                  let _ = hist.record(us);
                  count += 1;
                  sum_us = sum_us.saturating_add(us as u128);
              }
              None => break, // todos los senders dropeados
          },
      }
    }
  });

  tx
}

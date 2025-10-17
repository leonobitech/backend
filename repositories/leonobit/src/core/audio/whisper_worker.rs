use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use tokio::sync::mpsc::{Receiver, UnboundedSender};
use tokio::sync::Mutex;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext};

use crate::core::audio::opus::Opus48k;
use crate::core::audio::resample::Resampler48kTo16k;
use crate::core::audio::stt::SttMsg;

// ===== Ventanas / hop a 16 kHz (reactivo) =====
const WINDOW_SAMPLES_16K: usize = 48_000; // 3.0s (mejor contexto para Whisper)
const HOP_SAMPLES_16K: usize = 8_000; // 0.5s (menos llamadas, menos overhead)
const TAIL_AFTER_FINAL_16K: usize = 16_000; // 1.0s después de FINAL para continuidad
const MIN_SAMPLES_FOR_INFER_16K: usize = 16_000; // 1.0s mínimo para invocar Whisper

// ===== VAD simple por RMS =====
const SILENCE_THRESHOLD_RMS: f32 = 0.015; // Más alto para ignorar ruido de fondo
const SILENCE_HOLDOFF_MS: u64 = 800; // Esperar más antes de marcar como final

fn is_silence(samples: &[f32], thr: f32) -> bool {
  if samples.is_empty() {
    return false;
  }
  let acc: f32 = samples.iter().map(|x| x * x).sum();
  let rms = (acc / samples.len() as f32).sqrt();
  rms < thr
}

// helper ms pretty
fn ms(d: Duration) -> f32 {
  (d.as_secs_f64() * 1000.0) as f32
}

/// Task A (ingest): RTP Opus → 48k → 16k → buffer compartido
/// Task B (infer): cada hop toma tail, corre Whisper y emite parciales/finales
pub async fn run_whisper_worker(
  mut rx_opus: Receiver<Vec<u8>>,
  stt_tx: UnboundedSender<SttMsg>,
  ctx: Arc<WhisperContext>,
) -> Result<()> {
  // ---------- Estado Whisper ----------
  let mut state = ctx.create_state().context("crear whisper state")?;

  // ---------- Audio helpers ----------
  let mut opus = Opus48k::new(true).context("crear decoder opus 48k")?;
  let mut resampler = Resampler48kTo16k::new().context("crear resampler 48k→16k")?;

  // ---------- Parámetros Whisper ----------
  let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 0 });

  let n_threads = std::env::var("WHISPER_THREADS")
    .ok()
    .and_then(|s| s.parse::<i32>().ok())
    .unwrap_or_else(|| (num_cpus::get_physical().saturating_sub(1)).max(1) as i32);

  tracing::info!("whisper threads = {}", n_threads);
  params.set_n_threads(n_threads);
  params.set_translate(false);
  params.set_language(Some("es")); // <-- pon "en" si quieres inglés
  params.set_print_special(false);
  params.set_print_progress(false);
  params.set_print_realtime(false);
  params.set_print_timestamps(false);
  params.set_token_timestamps(false);

  // Contexto más largo para mejor calidad (default 1500)
  params.set_audio_ctx(1500); // Más contexto histórico

  // Permitir frases más largas
  params.set_max_len(1); // Sin límite de longitud (0 o 1 = sin límite)

  // Mejoras adicionales para calidad
  params.set_suppress_blank(true); // Eliminar blanks
  params.set_suppress_non_speech_tokens(true); // Eliminar tokens no-speech

  // ---------- Buffer PCM16 compartido ----------
  let pcm_buf: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::with_capacity(WINDOW_SAMPLES_16K)));

  // Para métricas simples por log:
  let first_audio_at: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));
  let last_ingest_log_at: Arc<Mutex<Instant>> = Arc::new(Mutex::new(Instant::now()));

  // ===== Task A: Ingestión =====
  let pcm_buf_ing = Arc::clone(&pcm_buf);
  let first_audio_ing = Arc::clone(&first_audio_at);
  let last_ingest_log_ing = Arc::clone(&last_ingest_log_at);

  let mut ingest_handle = tokio::spawn(async move {
    while let Some(opus_frame) = rx_opus.recv().await {
      let t0 = Instant::now();
      let (pcm48, _nsamp) = match opus.decode(&opus_frame) {
        Ok(x) => x,
        Err(e) => {
          tracing::warn!("decodificar opus 48k: {e:#}");
          continue;
        }
      };
      let t1 = Instant::now();

      if pcm48.is_empty() {
        continue;
      }

      // Downmix si estéreo
      let pcm48_mono = if opus.is_stereo() {
        Opus48k::downmix_stereo_to_mono(&pcm48)
      } else {
        pcm48
      };

      // 48k → 16k
      let pcm16_chunk = match resampler.process(&pcm48_mono) {
        Ok(x) => x,
        Err(e) => {
          tracing::warn!("resample 48k→16k: {e:#}");
          continue;
        }
      };
      let t2 = Instant::now();

      if pcm16_chunk.is_empty() {
        continue;
      }

      // Marca primer audio
      {
        let mut first = first_audio_ing.lock().await;
        if first.is_none() {
          *first = Some(Instant::now());
        }
      }

      // Append + recorte a ventana
      {
        let mut g = pcm_buf_ing.lock().await;
        g.extend_from_slice(&pcm16_chunk);
        if g.len() > WINDOW_SAMPLES_16K {
          let cut = g.len() - WINDOW_SAMPLES_16K;
          g.drain(..cut);
        }

        // Log ingest cada ~1s para no inundar
        let mut last = last_ingest_log_ing.lock().await;
        if last.elapsed() >= Duration::from_secs(1) {
          let tail_secs = g.len() as f32 / 16_000.0;
          tracing::info!(
            "ingest: decode={:.2}ms resample={:.2}ms chunk={} tail={:.2}s",
            ms(t1 - t0),
            ms(t2 - t1),
            pcm16_chunk.len(),
            tail_secs
          );
          *last = Instant::now();
        }
      }
    }
    tracing::info!("ingest task finished");
  });

  // ===== Task B: Inferencia periódica =====
  let mut last_partial = String::new();
  let mut last_partial_at = Instant::now();
  let mut first_partial_logged = false;

  let mut tick = tokio::time::interval(Duration::from_millis(
    (1000.0 * HOP_SAMPLES_16K as f32 / 16_000.0) as u64,
  ));
  tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

  loop {
    tokio::select! {
        res = &mut ingest_handle => {
            if let Err(e) = res {
                tracing::warn!("ingest join error: {e:#}");
            }
            break;
        }

        _ = tick.tick() => {
            // Snapshot del tail
            let tail: Vec<f32> = {
                let g = pcm_buf.lock().await;
                if g.is_empty() { continue; }
                g.clone()
            };

            let tail_secs = tail.len() as f32 / 16_000.0;

            // Evita invocar whisper con muy poco audio (reduce “ruido” y latencia por pasada)
            if tail.len() < MIN_SAMPLES_FOR_INFER_16K {
                tracing::debug!("infer: tail demasiado corto ({:.2}s) — skip", tail_secs);
                continue;
            }

            // Cronometra modelo
            let t_model = Instant::now();
            let res = tokio::task::block_in_place(|| {
                state.full(params.clone(), &tail[..])
            });
            let dt_model = t_model.elapsed();

            if let Err(e) = res {
                tracing::error!("whisper full error: {e:#} (tail={:.2}s)", tail_secs);
                continue;
            } else {
                tracing::info!("infer: whisper_full={:.0}ms tail={:.2}s", ms(dt_model), tail_secs);
            }

            // Construye hipótesis
            let mut hypo = String::new();
            for seg in state.as_iter() {
                let mut seg_txt = seg.to_string();
                seg_txt = seg_txt.trim().to_string();
                if seg_txt.is_empty() || seg_txt == "[BLANK_AUDIO]" { continue; }
                if !hypo.is_empty() { hypo.push(' '); }
                hypo.push_str(&seg_txt);
            }

            // Emitir PARCIAL si cambió
            if !hypo.is_empty() && hypo != last_partial {
                // Latencia extremo a extremo (first audio → primer parcial)
                if !first_partial_logged {
                    let start_opt = { first_audio_at.lock().await.clone() };
                    if let Some(t0) = start_opt {
                        let e2e = t0.elapsed();
                        tracing::info!("E2E: first_partial after {:.0}ms since first_audio", ms(e2e));
                    }
                    first_partial_logged = true;
                }

                tracing::info!("stt.partial: '{}'", hypo);
                let _ = stt_tx.send(SttMsg::Partial { text: hypo.clone() });
                last_partial = hypo;
                last_partial_at = Instant::now();
            }

            // Confirmar FINAL por VAD
            let vad_window = tail.get(tail.len().saturating_sub(4000)..).unwrap_or(&tail[..]); // ~0.25s
            if is_silence(vad_window, SILENCE_THRESHOLD_RMS)
                && !last_partial.is_empty()
                && last_partial_at.elapsed() > Duration::from_millis(SILENCE_HOLDOFF_MS)
            {
                let final_text = std::mem::take(&mut last_partial);
                tracing::info!("stt.final: '{}'", final_text);
                let _ = stt_tx.send(SttMsg::Final { text: final_text });

                // Mantener “cola” corta
                let mut g = pcm_buf.lock().await;
                if g.len() > TAIL_AFTER_FINAL_16K {
                    let keep_from = g.len() - TAIL_AFTER_FINAL_16K;
                    g.drain(..keep_from);
                }
                last_partial_at = Instant::now();
            }
        }
    }
  }

  Ok(())
}

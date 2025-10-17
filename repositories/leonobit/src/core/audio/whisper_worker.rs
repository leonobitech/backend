use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use tokio::sync::mpsc::{Receiver, UnboundedSender};
use tokio::sync::Mutex;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext};

use crate::core::audio::opus::Opus48k;
use crate::core::audio::resample::Resampler48kTo16k;
use crate::core::audio::stt::SttMsg;

// ===== Ventanas / hop a 16 kHz (más reactivo) =====
const WINDOW_SAMPLES_16K: usize = 64_000; // 4.0s (mejor contexto para Whisper)
const HOP_SAMPLES_16K: usize = 4_800; // 0.3s (más reactivo para tiempo real)
const TAIL_AFTER_FINAL_16K: usize = 8_000; // 0.5s después de FINAL
const MIN_SAMPLES_FOR_INFER_16K: usize = 12_000; // 0.75s mínimo para invocar Whisper

// ===== VAD inteligente (múltiples criterios) =====
const SILENCE_THRESHOLD_RMS: f32 = 0.01; // Umbral RMS relajado para captar voz normal
const SILENCE_THRESHOLD_ZCR: f32 = 0.3; // Zero Crossing Rate (ruido blanco tiene ZCR alto)
const SILENCE_THRESHOLD_ENERGY_RATIO: f32 = 3.0; // Ratio peak/mean energy más permisivo
const SILENCE_HOLDOFF_MS: u64 = 1200; // Esperar más tiempo antes de marcar final (1.2s)

/// VAD inteligente que usa múltiples criterios para distinguir voz de ruido
fn is_silence(samples: &[f32]) -> bool {
  if samples.is_empty() {
    return true;
  }

  // 1) RMS (Root Mean Square) - energía general
  let acc: f32 = samples.iter().map(|x| x * x).sum();
  let rms = (acc / samples.len() as f32).sqrt();

  tracing::trace!("VAD: rms={:.4}", rms);

  if rms < SILENCE_THRESHOLD_RMS {
    return true; // Muy bajo volumen = silencio
  }

  // 2) ZCR (Zero Crossing Rate) - frecuencia de cambios de signo
  // Ruido blanco tiene ZCR muy alto, voz humana tiene ZCR moderado
  let mut zero_crossings = 0;
  for i in 1..samples.len() {
    if (samples[i] >= 0.0) != (samples[i - 1] >= 0.0) {
      zero_crossings += 1;
    }
  }
  let zcr = zero_crossings as f32 / samples.len() as f32;

  if zcr > SILENCE_THRESHOLD_ZCR {
    return true; // ZCR muy alto = ruido blanco, no voz
  }

  // 3) Peak-to-mean energy ratio - voz tiene picos claros
  let peak = samples.iter().map(|x| x.abs()).fold(0.0f32, f32::max);
  let mean = samples.iter().map(|x| x.abs()).sum::<f32>() / samples.len() as f32;

  if mean > 0.0 {
    let ratio = peak / mean;
    tracing::trace!("VAD: peak/mean={:.2}", ratio);
    if ratio < SILENCE_THRESHOLD_ENERGY_RATIO {
      return true; // Sin picos claros = ruido constante, no voz
    }
  }

  tracing::trace!("VAD: ✅ VOZ DETECTADA");
  false // Pasó todos los criterios = probablemente voz
}

/// Valida que el texto transcrito sea coherente y no ruido
fn is_valid_transcription(text: &str) -> bool {
  // Rechazar si es muy corto (menos de 2 caracteres)
  if text.len() < 2 {
    return false;
  }

  // Rechazar si solo tiene caracteres repetidos (ej: "aaaa", ".....")
  let unique_chars: std::collections::HashSet<char> = text.chars().collect();
  if unique_chars.len() == 1 {
    return false;
  }

  // Rechazar si tiene muchos caracteres extraños consecutivos
  let weird_chars = text.chars().filter(|c| !c.is_alphanumeric() && !c.is_whitespace()).count();
  if weird_chars as f32 / text.len() as f32 > 0.5 {
    return false;
  }

  // Rechazar patrones sospechosos comunes de ruido
  let suspicious_patterns = [
    "gracias por ver",
    "subtítulos",
    "subtítulos realizados por",
    "traducción por",
    "gracias por su atención",
    "música",
    "[música]",
    "(música)",
  ];

  let text_lower = text.to_lowercase();
  for pattern in &suspicious_patterns {
    if text_lower.contains(pattern) {
      return false;
    }
  }

  true
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

  // Contexto más largo para mejor calidad
  params.set_audio_ctx(1500);

  // Permitir frases más largas
  params.set_max_len(1);

  // Eliminar ruido y tokens no deseados
  params.set_suppress_blank(true);
  params.set_suppress_nst(true);

  // Parámetros críticos para filtrar ruido
  params.set_temperature(0.0); // Sin sampling aleatorio = más determinístico
  params.set_entropy_thold(2.0); // Rechazar segmentos con alta entropía (ruido)
  params.set_logprob_thold(-1.0); // Rechazar segmentos con baja confianza
  params.set_no_speech_thold(0.6); // Threshold para detectar no-speech (más estricto)

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

  // Tracker de actividad de voz para prevenir conversaciones fantasma
  let mut last_speech_detected_at: Option<Instant> = None;
  let mut consecutive_silence_count = 0;
  const MAX_SILENCE_BEFORE_CLEAR: usize = 4; // 4 hops sin voz = limpiar buffer

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

            // Evita invocar whisper con muy poco audio
            if tail.len() < MIN_SAMPLES_FOR_INFER_16K {
                tracing::debug!("infer: tail demasiado corto ({:.2}s) — skip", tail_secs);
                continue;
            }

            // ===== DETECCIÓN DE VOZ ANTES DE WHISPER =====
            // Analizar si hay voz real en el buffer (prevenir conversaciones fantasma)
            let has_speech = !is_silence(&tail);

            if !has_speech {
                consecutive_silence_count += 1;
                tracing::debug!("infer: solo silencio detectado ({}/{})", consecutive_silence_count, MAX_SILENCE_BEFORE_CLEAR);

                // Si llevamos muchos hops sin voz, limpiar buffer agresivamente
                if consecutive_silence_count >= MAX_SILENCE_BEFORE_CLEAR {
                    tracing::info!("⚠️  Buffer limpiado: {} hops consecutivos sin voz detectada", consecutive_silence_count);
                    {
                        let mut g = pcm_buf.lock().await;
                        g.clear(); // Limpiar completamente el buffer
                    }
                    consecutive_silence_count = 0;
                    last_speech_detected_at = None;

                    // Si había texto parcial, descartarlo (era fantasma)
                    if !last_partial.is_empty() {
                        tracing::warn!("🚫 Descartando parcial fantasma: '{}'", last_partial);
                        last_partial.clear();
                    }
                }

                continue; // No invocar Whisper si solo hay silencio
            }

            // Hay voz real, resetear contador de silencio
            consecutive_silence_count = 0;
            last_speech_detected_at = Some(Instant::now());

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

            // Emitir PARCIAL si cambió y es válido
            if !hypo.is_empty() && hypo != last_partial && is_valid_transcription(&hypo) {
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
            } else if !hypo.is_empty() && !is_valid_transcription(&hypo) {
                tracing::debug!("stt: rechazado texto inválido: '{}'", hypo);
            }

            // Confirmar FINAL por VAD (ventana más grande para mejor detección)
            let vad_window = tail.get(tail.len().saturating_sub(8000)..).unwrap_or(&tail[..]); // ~0.5s
            if is_silence(vad_window)
                && !last_partial.is_empty()
                && last_partial_at.elapsed() > Duration::from_millis(SILENCE_HOLDOFF_MS)
            {
                let final_text = std::mem::take(&mut last_partial);

                // Solo enviar si es válido
                if is_valid_transcription(&final_text) {
                    tracing::info!("stt.final: '{}'", final_text);
                    let _ = stt_tx.send(SttMsg::Final { text: final_text });
                } else {
                    tracing::debug!("stt: rechazado final inválido: '{}'", final_text);
                }

                // Mantener "cola" corta
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

use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use tokio::sync::mpsc::{Receiver, UnboundedSender};
use tokio::sync::Mutex;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext};

use crate::core::audio::opus::Opus48k;
use crate::core::audio::resample::Resampler48kTo16k;
use crate::core::audio::stt::SttMsg;

// ===== Configuración de segmentación de frases =====
const VAD_CHECK_INTERVAL_MS: u64 = 100; // Chequear VAD cada 100ms (rápido)
const VAD_WINDOW_SAMPLES: usize = 1_600; // 100ms de audio a 16kHz para VAD
const PHRASE_END_SILENCE_MS: u64 = 800; // 800ms de silencio = fin de frase
const MIN_PHRASE_DURATION_MS: u64 = 500; // Mínimo 500ms para considerar frase válida
const MAX_PHRASE_DURATION_S: f32 = 30.0; // Máximo 30s por frase (safety)

// ===== VAD inteligente (múltiples criterios) =====
const SILENCE_THRESHOLD_RMS: f32 = 0.005; // Umbral RMS muy permisivo
const SILENCE_THRESHOLD_ZCR: f32 = 0.35; // Zero Crossing Rate (ruido blanco tiene ZCR alto)
const SILENCE_THRESHOLD_ENERGY_RATIO: f32 = 2.5; // Ratio peak/mean energy permisivo

/// Estado de la máquina de detección de frases
#[derive(Debug, Clone)]
enum SpeechState {
    /// Esperando inicio de voz
    Silence,
    /// Acumulando audio de una frase en progreso
    AccumulatingSpeech {
        phrase_start: Instant,
        last_speech_time: Instant,
    },
}

/// VAD inteligente que usa múltiples criterios para distinguir voz de ruido
/// Lógica: Solo marca silencio si TODOS los indicadores sugieren ausencia de voz
fn is_silence(samples: &[f32]) -> bool {
  if samples.is_empty() {
    return true;
  }

  // 1) RMS (Root Mean Square) - energía general
  let acc: f32 = samples.iter().map(|x| x * x).sum();
  let rms = (acc / samples.len() as f32).sqrt();

  tracing::trace!("VAD: rms={:.4}", rms);

  let is_silent_rms = rms < SILENCE_THRESHOLD_RMS;

  // 2) ZCR (Zero Crossing Rate) - frecuencia de cambios de signo
  // Ruido blanco tiene ZCR muy alto, voz humana tiene ZCR moderado
  let mut zero_crossings = 0;
  for i in 1..samples.len() {
    if (samples[i] >= 0.0) != (samples[i - 1] >= 0.0) {
      zero_crossings += 1;
    }
  }
  let zcr = zero_crossings as f32 / samples.len() as f32;

  let is_noise_zcr = zcr > SILENCE_THRESHOLD_ZCR;

  // 3) Peak-to-mean energy ratio - voz tiene picos claros
  let peak = samples.iter().map(|x| x.abs()).fold(0.0f32, f32::max);
  let mean = samples.iter().map(|x| x.abs()).sum::<f32>() / samples.len() as f32;

  let is_flat_energy = if mean > 0.0 {
    let ratio = peak / mean;
    tracing::trace!("VAD: peak/mean={:.2}", ratio);
    ratio < SILENCE_THRESHOLD_ENERGY_RATIO
  } else {
    true
  };

  // Solo marcar silencio si RMS es bajo Y (es ruido blanco O energía plana)
  // Esto permite que voz real pase incluso si falla uno de los criterios
  let is_silence = is_silent_rms && (is_noise_zcr || is_flat_energy);

  if !is_silence {
    tracing::trace!("VAD: ✅ VOZ DETECTADA (rms={:.4}, zcr={:.2}, ratio={:.2})", rms, zcr, peak/mean.max(0.0001));
  }

  is_silence
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

/// Procesa una frase completa con Whisper (invocación única, no streaming)
async fn process_complete_phrase(
  state: &mut whisper_rs::WhisperState,
  params: &FullParams<'_, '_>,
  phrase_audio: &[f32],
  stt_tx: &UnboundedSender<SttMsg>,
  first_audio_at: &Arc<Mutex<Option<Instant>>>,
  first_phrase_logged: &mut bool,
) {
  let phrase_secs = phrase_audio.len() as f32 / 16_000.0;

  tracing::info!("⏳ Procesando frase completa ({:.2}s de audio)...", phrase_secs);

  // Cronometrar Whisper
  let t0 = Instant::now();
  let res = tokio::task::block_in_place(|| {
    state.full(params.clone(), phrase_audio)
  });
  let dt = t0.elapsed();

  if let Err(e) = res {
    tracing::error!("whisper error: {e:#}");
    return;
  }

  tracing::info!("⚡ Whisper completado en {:.0}ms", ms(dt));

  // Construir transcripción final
  let mut transcription = String::new();
  for seg in state.as_iter() {
    let mut seg_txt = seg.to_string();
    seg_txt = seg_txt.trim().to_string();
    if seg_txt.is_empty() || seg_txt == "[BLANK_AUDIO]" {
      continue;
    }
    if !transcription.is_empty() {
      transcription.push(' ');
    }
    transcription.push_str(&seg_txt);
  }

  // Validar y enviar
  if transcription.is_empty() {
    tracing::debug!("Transcripción vacía - ignorando");
    return;
  }

  if !is_valid_transcription(&transcription) {
    tracing::debug!("Transcripción inválida: '{}'", transcription);
    return;
  }

  // Métricas E2E para primera frase
  if !*first_phrase_logged {
    let start_opt = { first_audio_at.lock().await.clone() };
    if let Some(t_start) = start_opt {
      let e2e = t_start.elapsed();
      tracing::info!("📊 E2E latencia primera frase: {:.0}ms", ms(e2e));
    }
    *first_phrase_logged = true;
  }

  // Enviar como FINAL (frase completa procesada de una sola vez)
  tracing::info!("📝 Transcripción: '{}'", transcription);
  let _ = stt_tx.send(SttMsg::Final { text: transcription });
}

/// Task A (ingest): RTP Opus → 48k → 16k → buffer compartido
/// Task B (segmentación): VAD rápido + procesamiento de frases completas
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
  let pcm_buf: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::with_capacity(480_000))); // ~30s máximo

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

      // Append sin recortar (acumulación continua para frases completas)
      {
        let mut g = pcm_buf_ing.lock().await;
        g.extend_from_slice(&pcm16_chunk);

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

  // ===== Task B: Segmentación y procesamiento de frases =====
  let mut speech_state = SpeechState::Silence;
  let mut phrase_buffer: Vec<f32> = Vec::new();
  let mut first_phrase_logged = false;

  // VAD check interval (100ms)
  let mut vad_tick = tokio::time::interval(Duration::from_millis(VAD_CHECK_INTERVAL_MS));
  vad_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

  loop {
    tokio::select! {
        res = &mut ingest_handle => {
            if let Err(e) = res {
                tracing::warn!("ingest join error: {e:#}");
            }
            break;
        }

        _ = vad_tick.tick() => {
            // ===== MÁQUINA DE ESTADOS PARA SEGMENTACIÓN DE FRASES =====

            // 1. Obtener ventana de audio más reciente para VAD (100ms)
            let vad_window: Vec<f32> = {
                let g = pcm_buf.lock().await;
                if g.is_empty() { continue; }

                // Tomar última ventana de 100ms para VAD rápido
                let start_idx = g.len().saturating_sub(VAD_WINDOW_SAMPLES);
                g[start_idx..].to_vec()
            };

            // 2. Detectar si hay voz en esta ventana
            let has_speech = !is_silence(&vad_window);

            // 3. Máquina de estados
            match speech_state {
                // ===== ESTADO: SILENCIO =====
                SpeechState::Silence => {
                    if has_speech {
                        // Inicio de nueva frase detectado
                        let now = Instant::now();
                        tracing::info!("🎤 Inicio de frase detectado");

                        speech_state = SpeechState::AccumulatingSpeech {
                            phrase_start: now,
                            last_speech_time: now,
                        };

                        // Iniciar buffer de frase con audio acumulado
                        {
                            let g = pcm_buf.lock().await;
                            phrase_buffer = g.clone();
                        }
                    }
                }

                // ===== ESTADO: ACUMULANDO VOZ =====
                SpeechState::AccumulatingSpeech { phrase_start, mut last_speech_time } => {
                    if has_speech {
                        // Actualizar tiempo de última voz
                        last_speech_time = Instant::now();
                        speech_state = SpeechState::AccumulatingSpeech {
                            phrase_start,
                            last_speech_time,
                        };
                    }

                    // Actualizar phrase_buffer con todo el audio acumulado
                    {
                        let g = pcm_buf.lock().await;
                        phrase_buffer = g.clone();
                    }

                    let phrase_duration = phrase_start.elapsed();
                    let silence_duration = last_speech_time.elapsed();

                    // Safety: Frase demasiado larga (>30s)
                    if phrase_duration.as_secs_f32() > MAX_PHRASE_DURATION_S {
                        tracing::warn!("⚠️  Frase demasiado larga ({:.1}s) - forzando procesamiento", phrase_duration.as_secs_f32());

                        // Procesar frase ahora
                        if phrase_buffer.len() as f32 / 16_000.0 >= MIN_PHRASE_DURATION_MS as f32 / 1000.0 {
                            process_complete_phrase(
                                &mut state,
                                &params,
                                &phrase_buffer,
                                &stt_tx,
                                &first_audio_at,
                                &mut first_phrase_logged,
                            ).await;
                        }

                        // Limpiar buffer y volver a silencio
                        phrase_buffer.clear();
                        {
                            let mut g = pcm_buf.lock().await;
                            g.clear();
                        }
                        speech_state = SpeechState::Silence;
                        continue;
                    }

                    // Condición: Fin de frase (silencio > 800ms)
                    if silence_duration.as_millis() >= PHRASE_END_SILENCE_MS as u128 {
                        let phrase_secs = phrase_buffer.len() as f32 / 16_000.0;

                        tracing::info!(
                            "✅ Fin de frase detectado (duración: {:.2}s, silencio: {:.0}ms)",
                            phrase_secs,
                            silence_duration.as_millis()
                        );

                        // Procesar solo si cumple duración mínima
                        if phrase_duration.as_millis() >= MIN_PHRASE_DURATION_MS as u128 {
                            process_complete_phrase(
                                &mut state,
                                &params,
                                &phrase_buffer,
                                &stt_tx,
                                &first_audio_at,
                                &mut first_phrase_logged,
                            ).await;
                        } else {
                            tracing::debug!("Frase muy corta ({:.0}ms) - ignorando", phrase_duration.as_millis());
                        }

                        // Limpiar y volver a silencio
                        phrase_buffer.clear();
                        {
                            let mut g = pcm_buf.lock().await;
                            g.clear();
                        }
                        speech_state = SpeechState::Silence;
                    }
                }
            }
        }
    }
  }

  Ok(())
}

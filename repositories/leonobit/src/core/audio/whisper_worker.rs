use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
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

// ===== VAD Espectral con FFT =====
const SPEECH_FREQ_MIN: f32 = 300.0; // Hz - Frecuencia mínima de voz humana
const SPEECH_FREQ_MAX: f32 = 3400.0; // Hz - Frecuencia máxima de voz humana
const FORMANT_F1_MIN: f32 = 500.0; // Hz - Primer formante (vocales)
const FORMANT_F1_MAX: f32 = 900.0;
const FORMANT_F2_MIN: f32 = 1400.0; // Hz - Segundo formante (vocales)
const FORMANT_F2_MAX: f32 = 2200.0;
const FORMANT_F3_MIN: f32 = 2200.0; // Hz - Tercer formante (consonantes)
const FORMANT_F3_MAX: f32 = 3200.0;

const SPECTRAL_FLATNESS_THRESHOLD: f32 = 0.60; // Bajo = voz, Alto = ruido blanco
const FORMANT_ENERGY_THRESHOLD: f32 = 0.05; // Mínima energía en formantes
const SPEECH_BAND_THRESHOLD: f32 = 0.20; // Mínimo 20% energía en banda de voz (más permisivo post-filtrado)

// ===== Sistema Adaptativo de Filtrado Espectral =====
const SPECTRAL_FLUX_THRESHOLD: f32 = 0.02; // Umbral de cambio espectral (más permisivo)
const NOISE_LEARN_RATE: f32 = 0.98; // Velocidad de adaptación del perfil de ruido (muy lento)
const OVERSUBTRACTION_FACTOR: f32 = 1.0; // Factor de sobre-sustracción (desactivado - conservador)
const NOISE_FLOOR: f32 = 0.001; // Piso de ruido mínimo para evitar división por cero
const MIN_GAIN: f32 = 0.3; // Ganancia mínima más alta para preservar voz (-10dB)

// ===== Gateo temporal y contexto =====
const VAD_RMS_THRESHOLD: f32 = 0.015; // Fallback de energía RMS
const SPEECH_GATE_ON_WINDOWS: usize = 3; // 3 ventanas consecutivas (~300ms) para activar
const SPEECH_GATE_OFF_WINDOWS: usize = 4; // 4 ventanas de silencio (~400ms) para desactivar
const MAX_GATE_MEMORY_WINDOWS: usize = 12; // Tope para los contadores (~1.2s)
const PHRASE_CONTEXT_MS: usize = 300; // Contexto a conservar tras finalizar (ms)
const PHRASE_CONTEXT_SAMPLES: usize = PHRASE_CONTEXT_MS * 16_000 / 1000;
const MIN_PHRASE_SAMPLES: usize = MIN_PHRASE_DURATION_MS as usize * 16_000 / 1000;

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

/// Estimador adaptativo del perfil de ruido de fondo
struct NoiseProfileEstimator {
  /// Espectro promedio del ruido (se actualiza durante silencio)
  noise_spectrum: Vec<f32>,
  /// Contador de frames de silencio para estabilizar estimación
  silence_frames: u32,
}

impl NoiseProfileEstimator {
  fn new(spectrum_size: usize) -> Self {
    Self {
      noise_spectrum: vec![NOISE_FLOOR; spectrum_size],
      silence_frames: 0,
    }
  }

  /// Actualiza perfil de ruido durante silencio (suavizado exponencial)
  fn update(&mut self, spectrum: &[f32], is_silence: bool) {
    if !is_silence || spectrum.len() != self.noise_spectrum.len() {
      return;
    }

    self.silence_frames += 1;

    // Actualización con suavizado exponencial: noise = α*noise + (1-α)*spectrum
    for (noise, &signal) in self.noise_spectrum.iter_mut().zip(spectrum.iter()) {
      *noise = NOISE_LEARN_RATE * (*noise) + (1.0 - NOISE_LEARN_RATE) * signal;
    }
  }

  /// Aplica Wiener Filter adaptativo para suprimir ruido
  /// Retorna espectro limpio con ganancia modulada por SNR
  fn apply_filter(&self, spectrum: &[f32]) -> Vec<f32> {
    spectrum
      .iter()
      .zip(&self.noise_spectrum)
      .map(|(&signal, &noise)| {
        // Estimar SNR local (Signal-to-Noise Ratio)
        let noise_est = noise.max(NOISE_FLOOR);
        let snr = (signal / noise_est).max(0.0);

        // Wiener Filter: ganancia = SNR / (1 + SNR)
        // Alta SNR (voz fuerte) → ganancia ≈ 1.0 (sin atenuación)
        // Baja SNR (ruido) → ganancia ≈ 0.0 (máxima atenuación)
        let gain = (snr / (1.0 + snr)).max(MIN_GAIN);

        // Aplicar ganancia con over-subtraction para ruido persistente
        let clean_magnitude = if snr < OVERSUBTRACTION_FACTOR {
          (signal - OVERSUBTRACTION_FACTOR * noise_est).max(0.0)
        } else {
          signal * gain
        };

        clean_magnitude
      })
      .collect()
  }
}

/// Cache del espectro anterior para detectar varianza temporal
struct SpectralMemory {
  prev_spectrum: Option<Vec<f32>>,
  noise_estimator: NoiseProfileEstimator,
}

/// VAD Espectral Adaptativo: Detecta voz humana vs ruido usando FFT + filtrado dinámico
fn is_silence(samples: &[f32], memory: &mut SpectralMemory) -> bool {
  if samples.is_empty() {
    tracing::trace!("🔇 is_silence: samples vacíos");
    return true;
  }

  tracing::trace!("🔍 is_silence: procesando {} samples", samples.len());

  // 1. FFT para análisis espectral (espectro RAW sin filtrar)
  let raw_spectrum = compute_magnitude_spectrum(samples);
  let sample_rate = 16000.0; // Hz

  // Inicializar estimador de ruido si es necesario
  if memory.noise_estimator.noise_spectrum.len() != raw_spectrum.len() {
    memory.noise_estimator = NoiseProfileEstimator::new(raw_spectrum.len());
  }

  // 2. Decisión preliminar de silencio (basada en espectro RAW)
  let preliminary_silence = {
    let raw_speech_band = measure_band_energy(&raw_spectrum, sample_rate, SPEECH_FREQ_MIN, SPEECH_FREQ_MAX);
    let raw_flux = if let Some(ref prev) = memory.prev_spectrum {
      if prev.len() == raw_spectrum.len() {
        let diff_sum: f32 = raw_spectrum
          .iter()
          .zip(prev.iter())
          .map(|(curr, prev)| (curr - prev).powi(2))
          .sum();
        let total_energy: f32 = raw_spectrum.iter().map(|x| x * x).sum::<f32>();
        if total_energy > 0.0 {
          (diff_sum / total_energy).sqrt()
        } else {
          0.0
        }
      } else {
        0.0
      }
    } else {
      0.0
    };

    // Silencio preliminar: bajo flujo Y baja energía
    raw_flux < SPECTRAL_FLUX_THRESHOLD && raw_speech_band < SPEECH_BAND_THRESHOLD
  };

  // 3. Calcular flujo espectral ANTES de filtrar (sobre espectro RAW para detectar cambios reales)
  let spectral_flux = if let Some(ref prev) = memory.prev_spectrum {
    if prev.len() == raw_spectrum.len() {
      let diff_sum: f32 = raw_spectrum
        .iter()
        .zip(prev.iter())
        .map(|(curr, prev)| (curr - prev).powi(2))
        .sum();
      let total_energy: f32 = raw_spectrum.iter().map(|x| x * x).sum::<f32>();
      if total_energy > 0.0 {
        (diff_sum / total_energy).sqrt()
      } else {
        0.0
      }
    } else {
      0.0
    }
  } else {
    0.0
  };

  // Guardar espectro RAW para próxima comparación de flux
  memory.prev_spectrum = Some(raw_spectrum.clone());

  // 4. Actualizar perfil de ruido durante silencio
  memory.noise_estimator.update(&raw_spectrum, preliminary_silence);

  // 5. Aplicar filtro Wiener adaptativo para limpiar el espectro
  let clean_spectrum = memory.noise_estimator.apply_filter(&raw_spectrum);

  // 6. Análisis del espectro LIMPIO
  let speech_band_energy = measure_band_energy(&clean_spectrum, sample_rate, SPEECH_FREQ_MIN, SPEECH_FREQ_MAX);
  let f1_energy = measure_band_energy(&clean_spectrum, sample_rate, FORMANT_F1_MIN, FORMANT_F1_MAX);
  let f2_energy = measure_band_energy(&clean_spectrum, sample_rate, FORMANT_F2_MIN, FORMANT_F2_MAX);
  let f3_energy = measure_band_energy(&clean_spectrum, sample_rate, FORMANT_F3_MIN, FORMANT_F3_MAX);
  let formant_energy = (f1_energy + f2_energy + f3_energy) / 3.0;
  let flatness = spectral_flatness(&clean_spectrum);

  // 7. Decisión final sobre espectro LIMPIO
  let has_spectral_change = spectral_flux > SPECTRAL_FLUX_THRESHOLD;
  let has_speech_band = speech_band_energy > SPEECH_BAND_THRESHOLD;
  let has_formants = formant_energy > FORMANT_ENERGY_THRESHOLD;
  let not_white_noise = flatness < SPECTRAL_FLATNESS_THRESHOLD;

  let is_speech = has_spectral_change && has_speech_band && (has_formants || not_white_noise);

  if is_speech {
    tracing::debug!(
      "🎤 VOZ [limpia]: flux={:.3}, speech_band={:.2}, formants={:.2}, flatness={:.2}, noise_frames={}",
      spectral_flux, speech_band_energy, formant_energy, flatness, memory.noise_estimator.silence_frames
    );
  } else {
    tracing::debug!(
      "🔇 RUIDO: flux={:.3}, speech_band={:.2}, formants={:.2}, flatness={:.2}, noise_frames={}",
      spectral_flux, speech_band_energy, formant_energy, flatness, memory.noise_estimator.silence_frames
    );
  }

  !is_speech
}

/// Calcula el espectro de magnitudes usando FFT
fn compute_magnitude_spectrum(samples: &[f32]) -> Vec<f32> {
  let n = samples.len();

  // Preparar buffer complejo para FFT
  let mut buffer: Vec<Complex<f32>> = samples.iter().map(|&x| Complex { re: x, im: 0.0 }).collect();

  // Aplicar ventana de Hanning para reducir artifacts espectrales
  for (i, sample) in buffer.iter_mut().enumerate() {
    let window = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / n as f32).cos());
    sample.re *= window;
  }

  // Ejecutar FFT
  let mut planner = FftPlanner::new();
  let fft = planner.plan_fft_forward(n);
  fft.process(&mut buffer);

  // Calcular magnitudes (solo necesitamos primera mitad del espectro)
  buffer[..n / 2]
    .iter()
    .map(|c| (c.re * c.re + c.im * c.im).sqrt())
    .collect()
}

/// Mide la energía en una banda de frecuencias específica
fn measure_band_energy(spectrum: &[f32], sample_rate: f32, freq_min: f32, freq_max: f32) -> f32 {
  let n = spectrum.len();
  let freq_resolution = sample_rate / (2.0 * n as f32);

  let bin_min = (freq_min / freq_resolution) as usize;
  let bin_max = ((freq_max / freq_resolution) as usize).min(n - 1);

  if bin_min >= bin_max {
    return 0.0;
  }

  let band_energy: f32 = spectrum[bin_min..=bin_max].iter().sum();
  let total_energy: f32 = spectrum.iter().sum();

  if total_energy > 0.0 {
    band_energy / total_energy
  } else {
    0.0
  }
}

/// Calcula spectral flatness (medida de "planitud" del espectro)
/// Valores cercanos a 1.0 = ruido blanco
/// Valores cercanos a 0.0 = señal tonal (voz)
fn spectral_flatness(spectrum: &[f32]) -> f32 {
  if spectrum.is_empty() {
    return 1.0;
  }

  // Media geométrica
  let geometric_mean = spectrum.iter().map(|&x| (x + 1e-10).ln()).sum::<f32>() / spectrum.len() as f32;
  let geometric_mean = geometric_mean.exp();

  // Media aritmética
  let arithmetic_mean = spectrum.iter().sum::<f32>() / spectrum.len() as f32;

  if arithmetic_mean > 0.0 {
    geometric_mean / arithmetic_mean
  } else {
    1.0
  }
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
  let weird_chars = text
    .chars()
    .filter(|c| !c.is_alphanumeric() && !c.is_whitespace())
    .count();
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

fn root_mean_square(samples: &[f32]) -> f32 {
  if samples.is_empty() {
    return 0.0;
  }
  let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
  (sum_sq / samples.len() as f32).sqrt()
}

fn retain_trailing_context(buffer: &mut Vec<f32>) {
  if buffer.len() > PHRASE_CONTEXT_SAMPLES {
    let keep_from = buffer.len() - PHRASE_CONTEXT_SAMPLES;
    buffer.drain(..keep_from);
  }
}

/// Procesa una frase completa con Whisper (invocación única, no streaming)
async fn process_complete_phrase(
  state: &mut whisper_rs::WhisperState,
  params: &FullParams<'_, '_>,
  phrase_audio: &[f32],
  stt_tx: &UnboundedSender<SttMsg>,
  first_audio_at: &Arc<Mutex<Option<Instant>>>,
  first_phrase_logged: &mut bool,
  is_final: bool, // true = Final (último segmento), false = Partial (segmento intermedio)
) {
  let phrase_secs = phrase_audio.len() as f32 / 16_000.0;

  tracing::info!("⏳ Procesando frase completa ({:.2}s de audio)...", phrase_secs);

  // Cronometrar Whisper
  let t0 = Instant::now();
  let res = tokio::task::block_in_place(|| state.full(params.clone(), phrase_audio));
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

  // Enviar como Partial o Final según el contexto
  if is_final {
    tracing::info!("📝 Transcripción FINAL: '{}'", transcription);
    let _ = stt_tx.send(SttMsg::Final { text: transcription });
  } else {
    tracing::info!("📝 Transcripción PARCIAL: '{}'", transcription);
    let _ = stt_tx.send(SttMsg::Partial { text: transcription });
  }
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
  // params.set_temperature(0.0); // Sin sampling aleatorio = más determinístico
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
  let mut first_phrase_logged = false;
  let mut spectral_memory = SpectralMemory {
    prev_spectrum: None,
    noise_estimator: NoiseProfileEstimator::new(800), // 1600 samples / 2 = 800 bins FFT
  };
  let mut consecutive_speech_windows: usize = 0;
  let mut consecutive_silence_windows: usize = 0;

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
            let raw_has_speech = !is_silence(&vad_window, &mut spectral_memory);
            let rms = root_mean_square(&vad_window);
            let mut speech_candidate = raw_has_speech;
            let mut rms_fallback = false;

            if !speech_candidate && rms >= VAD_RMS_THRESHOLD {
                speech_candidate = true;
                rms_fallback = true;
            }

            if speech_candidate {
                consecutive_speech_windows = (consecutive_speech_windows + 1).min(MAX_GATE_MEMORY_WINDOWS);
                consecutive_silence_windows = 0;
            } else {
                consecutive_silence_windows = (consecutive_silence_windows + 1).min(MAX_GATE_MEMORY_WINDOWS);
                consecutive_speech_windows = 0;
            }

            let speech_gate_ready = consecutive_speech_windows >= SPEECH_GATE_ON_WINDOWS;
            let silence_gate_ready = consecutive_silence_windows >= SPEECH_GATE_OFF_WINDOWS;

            if rms_fallback {
                tracing::trace!(
                    "🎚️ RMS fallback activado: rms={:.4} >= {:.4}",
                    rms,
                    VAD_RMS_THRESHOLD
                );
            }

            tracing::trace!(
                "📈 VAD window → raw_speech={} speech_windows={} silence_windows={} rms={:.4}",
                raw_has_speech,
                consecutive_speech_windows,
                consecutive_silence_windows,
                rms
            );

            // 3. Máquina de estados
            match speech_state {
                // ===== ESTADO: SILENCIO =====
                SpeechState::Silence => {
                    if speech_gate_ready {
                        // Inicio de nueva frase detectado
                        let now = Instant::now();
                        tracing::info!("🎤 Inicio de frase detectado");

                        speech_state = SpeechState::AccumulatingSpeech {
                            phrase_start: now,
                            last_speech_time: now,
                        };
                    }
                }

                // ===== ESTADO: ACUMULANDO VOZ =====
                SpeechState::AccumulatingSpeech { phrase_start, mut last_speech_time } => {
                    if speech_candidate {
                        // Actualizar tiempo de última voz
                        last_speech_time = Instant::now();
                        speech_state = SpeechState::AccumulatingSpeech {
                            phrase_start,
                            last_speech_time,
                        };
                    }

                    let phrase_duration = phrase_start.elapsed();
                    let silence_duration = last_speech_time.elapsed();

                    // Safety: Frase demasiado larga (>30s)
                    if phrase_duration.as_secs_f32() > MAX_PHRASE_DURATION_S {
                        tracing::warn!("⚠️  Frase demasiado larga ({:.1}s) - forzando procesamiento", phrase_duration.as_secs_f32());

                        // Capturar buffer acumulado
                        let phrase_audio = {
                            let g = pcm_buf.lock().await;
                            g.clone()
                        };

                        // Procesar frase ahora (PARTIAL - segmento intermedio por exceder 30s)
                        if phrase_audio.len() as f32 / 16_000.0 >= MIN_PHRASE_DURATION_MS as f32 / 1000.0 {
                            process_complete_phrase(
                                &mut state,
                                &params,
                                &phrase_audio,
                                &stt_tx,
                                &first_audio_at,
                                &mut first_phrase_logged,
                                false, // is_final = false (segmento intermedio)
                            ).await;
                        }

                        // Limpiar buffer y volver a silencio
                        {
                            let mut g = pcm_buf.lock().await;
                            retain_trailing_context(&mut g);
                        }
                        speech_state = SpeechState::Silence;
                        continue;
                    }

                    // Condición: Fin de frase (silencio > 800ms)
                    if silence_gate_ready && silence_duration.as_millis() >= PHRASE_END_SILENCE_MS as u128 {
                        // Capturar buffer acumulado
                        let phrase_audio = {
                            let g = pcm_buf.lock().await;
                            g.clone()
                        };

                        let phrase_secs = phrase_audio.len() as f32 / 16_000.0;

                        tracing::info!(
                            "✅ Fin de frase detectado (duración: {:.2}s, silencio: {:.0}ms)",
                            phrase_secs,
                            silence_duration.as_millis()
                        );

                        // Procesar solo si cumple duración mínima (PARTIAL - segmento por pausa de silencio)
                        if phrase_duration.as_millis() >= MIN_PHRASE_DURATION_MS as u128 {
                            process_complete_phrase(
                                &mut state,
                                &params,
                                &phrase_audio,
                                &stt_tx,
                                &first_audio_at,
                                &mut first_phrase_logged,
                                false, // is_final = false (segmento intermedio)
                            ).await;
                        } else {
                            tracing::debug!("Frase muy corta ({:.0}ms) - ignorando", phrase_duration.as_millis());
                        }

                        // Limpiar y volver a silencio
                        {
                            let mut g = pcm_buf.lock().await;
                            retain_trailing_context(&mut g);
                        }
                        speech_state = SpeechState::Silence;
                    }
                }
            }
        }
    }
  }

  let pending_audio = {
    let mut buf = pcm_buf.lock().await;
    if buf.is_empty() {
      None
    } else {
      let samples = buf.len();
      let phrase_duration = samples as f32 / 16_000.0;
      let dur_ms = ms(Duration::from_secs_f64(phrase_duration as f64));

      if samples >= MIN_PHRASE_SAMPLES {
        tracing::info!(
          "⏹️ Flush final: procesando frase pendiente al cierre ({:.2}s, ~{:.0}ms)",
          phrase_duration,
          dur_ms
        );
        let audio = buf.clone();
        buf.clear();
        Some(audio)
      } else {
        tracing::debug!(
          "Flush final: descartando {:.0}ms pendientes (< {}ms mínimos)",
          dur_ms,
          MIN_PHRASE_DURATION_MS
        );
        buf.clear();
        None
      }
    }
  };

  if let Some(audio) = pending_audio {
    // FINAL - Último segmento al desconectar
    process_complete_phrase(
      &mut state,
      &params,
      &audio,
      &stt_tx,
      &first_audio_at,
      &mut first_phrase_logged,
      true, // is_final = true (último segmento)
    )
    .await;
  }

  Ok(())
}

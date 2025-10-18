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
const PHRASE_END_SILENCE_MS: u64 = 500; // 500ms de silencio = fin de frase (reducido de 800ms para mejor UX)
const MIN_PHRASE_DURATION_MS: u64 = 400; // Mínimo 400ms para considerar frase válida (reducido de 500ms)
const MAX_PHRASE_DURATION_S: f32 = 30.0; // Máximo 30s por frase (safety)

// ===== Configuración de Streaming (NUEVO para demo MVP) =====
const STREAMING_ENABLED: bool = true; // Enable/disable streaming parcials
const STREAMING_UPDATE_INTERVAL_MS: u64 = 1500; // Enviar update cada 1.5s mientras habla
const STREAMING_MIN_AUDIO_MS: u64 = 1000; // Mínimo 1s de audio para primera transcripción parcial
const STREAMING_OVERLAP_MS: u64 = 300; // 300ms overlap para mantener contexto entre windows

// ===== VAD Espectral con FFT =====
const SPEECH_FREQ_MIN: f32 = 300.0; // Hz - Frecuencia mínima de voz humana
const SPEECH_FREQ_MAX: f32 = 3400.0; // Hz - Frecuencia máxima de voz humana
const FORMANT_F1_MIN: f32 = 500.0; // Hz - Primer formante (vocales)
const FORMANT_F1_MAX: f32 = 900.0;
const FORMANT_F2_MIN: f32 = 1400.0; // Hz - Segundo formante (vocales)
const FORMANT_F2_MAX: f32 = 2200.0;
const FORMANT_F3_MIN: f32 = 2200.0; // Hz - Tercer formante (consonantes)
const FORMANT_F3_MAX: f32 = 3200.0;

const SPECTRAL_FLATNESS_THRESHOLD: f32 = 0.25; // Bajo = voz, Alto = ruido blanco (más estricto)
const FORMANT_ENERGY_THRESHOLD: f32 = 0.14; // Mínima energía en formantes (voz real > 0.14)
const SPEECH_BAND_THRESHOLD: f32 = 0.70; // Mínimo 70% energía en banda de voz (más estricto)

// ===== Detector de varianza espectral =====
const SPECTRAL_FLUX_THRESHOLD: f32 = 0.25; // Umbral de cambio espectral (incrementado para reducir falsos positivos)

// ===== Umbral de energía RMS (nuevo) =====
const RMS_ENERGY_THRESHOLD: f32 = 0.018; // Energía RMS balanceada (ni muy bajo ni muy alto)

/// Estado de la máquina de detección de frases
#[derive(Debug)]
enum SpeechState {
  /// Esperando inicio de voz
  Silence,
  /// Acumulando audio de una frase en progreso
  AccumulatingSpeech {
    phrase_start: Instant,
    last_speech_time: Instant,
    streaming_ctx: StreamingContext,
  },
}

/// Contexto para transcripciones parciales en streaming (NUEVO)
#[derive(Debug)]
struct StreamingContext {
  /// Última transcripción parcial enviada
  last_partial_text: String,
  /// Última vez que enviamos update parcial
  last_update_time: Instant,
  /// Contador de palabras en última transcripción (para detectar cambios significativos)
  last_word_count: usize,
}

impl StreamingContext {
  fn new() -> Self {
    Self {
      last_partial_text: String::new(),
      last_update_time: Instant::now(),
      last_word_count: 0,
    }
  }

  /// Verifica si debemos enviar un update parcial
  fn should_send_update(&self, current_word_count: usize) -> bool {
    if !STREAMING_ENABLED {
      return false;
    }

    let elapsed = self.last_update_time.elapsed();
    let has_new_words = current_word_count > self.last_word_count;

    // Enviar si pasó el intervalo Y hay palabras nuevas
    elapsed.as_millis() >= STREAMING_UPDATE_INTERVAL_MS as u128 && has_new_words
  }
}

/// Cache del espectro anterior para detectar varianza temporal
struct SpectralMemory {
  prev_spectrum: Option<Vec<f32>>,
}

/// VAD Espectral: Detecta voz humana vs ruido usando análisis de frecuencias (FFT) + varianza temporal
fn is_silence(samples: &[f32], memory: &mut SpectralMemory) -> bool {
  if samples.is_empty() {
    return true;
  }

  // 0. Filtro RMS (energía total) - NUEVO: Rechazar audio muy suave
  let rms_energy = compute_rms_energy(samples);
  if rms_energy < RMS_ENERGY_THRESHOLD {
    tracing::trace!(
      "🔇 RMS muy bajo: {:.4} (umbral: {:.4})",
      rms_energy,
      RMS_ENERGY_THRESHOLD
    );
    return true; // Demasiado suave = silencio
  }

  // 1. FFT para análisis espectral
  let spectrum = compute_magnitude_spectrum(samples);
  let sample_rate = 16000.0; // Hz

  // 2. Calcular flujo espectral (spectral flux): cambio entre ventanas consecutivas
  let spectral_flux = if let Some(ref prev) = memory.prev_spectrum {
    if prev.len() == spectrum.len() {
      // Calcular diferencia cuadrática normalizada
      let diff_sum: f32 = spectrum
        .iter()
        .zip(prev.iter())
        .map(|(curr, prev)| (curr - prev).powi(2))
        .sum();

      let total_energy: f32 = spectrum.iter().map(|x| x * x).sum::<f32>();

      if total_energy > 0.0 {
        (diff_sum / total_energy).sqrt()
      } else {
        0.0
      }
    } else {
      0.0
    }
  } else {
    0.0 // Primera ventana, no hay comparación
  };

  // Guardar espectro actual para próxima comparación
  memory.prev_spectrum = Some(spectrum.clone());

  // 3. Medir energía en banda de voz humana (300-3400 Hz)
  let speech_band_energy = measure_band_energy(&spectrum, sample_rate, SPEECH_FREQ_MIN, SPEECH_FREQ_MAX);

  // 4. Medir energía en formantes (picos característicos de voz)
  let f1_energy = measure_band_energy(&spectrum, sample_rate, FORMANT_F1_MIN, FORMANT_F1_MAX);
  let f2_energy = measure_band_energy(&spectrum, sample_rate, FORMANT_F2_MIN, FORMANT_F2_MAX);
  let f3_energy = measure_band_energy(&spectrum, sample_rate, FORMANT_F3_MIN, FORMANT_F3_MAX);

  let formant_energy = (f1_energy + f2_energy + f3_energy) / 3.0;

  // 5. Calcular spectral flatness (detecta ruido blanco)
  let flatness = spectral_flatness(&spectrum);

  // 6. Decisión mejorada: ¿Es voz humana?
  let has_spectral_change = spectral_flux > SPECTRAL_FLUX_THRESHOLD;
  let has_speech_band = speech_band_energy > SPEECH_BAND_THRESHOLD;
  let has_formants = formant_energy > FORMANT_ENERGY_THRESHOLD;
  let not_white_noise = flatness < SPECTRAL_FLATNESS_THRESHOLD;

  // MEJORA: Hacer el cambio espectral opcional si los otros criterios son muy fuertes
  // Permite detectar voz continua/monótona sin perder robustez contra ruido constante
  let strong_voice_indicators = has_speech_band && has_formants && not_white_noise;
  let is_speech = (has_spectral_change && has_speech_band && (has_formants || not_white_noise))
    || (strong_voice_indicators && rms_energy > RMS_ENERGY_THRESHOLD * 2.0); // Voz fuerte sin cambio espectral

  if is_speech {
    tracing::info!(
      "🎤 VOZ: rms={:.4}, flux={:.3}, speech_band={:.2}, formants={:.2}, flatness={:.2}",
      rms_energy,
      spectral_flux,
      speech_band_energy,
      formant_energy,
      flatness
    );
  }
  // Note: No mostramos logs de RUIDO para no inundar, pero el VAD está funcionando

  !is_speech // Retornar true si NO es voz (es silencio/ruido)
}

/// Calcula la energía RMS (Root Mean Square) de una ventana de audio
fn compute_rms_energy(samples: &[f32]) -> f32 {
  if samples.is_empty() {
    return 0.0;
  }

  let sum_of_squares: f32 = samples.iter().map(|&x| x * x).sum();
  (sum_of_squares / samples.len() as f32).sqrt()
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
  let text_trimmed = text.trim();

  // Rechazar si es muy corto (menos de 3 caracteres)
  if text_trimmed.len() < 3 {
    tracing::debug!("Rechazado por muy corto (< 3 chars): '{}'", text_trimmed);
    return false;
  }

  // Obtener palabras para validaciones
  let words: Vec<&str> = text_trimmed.split_whitespace().collect();

  // Rechazar si solo tiene caracteres repetidos (ej: "aaaa", ".....")
  let unique_chars: std::collections::HashSet<char> = text_trimmed.chars().collect();
  if unique_chars.len() == 1 {
    return false;
  }

  // NUEVO: Rechazar repeticiones de la misma palabra/sílaba
  if words.len() > 2 {
    // Si más del 60% son la misma palabra, rechazar
    let mut word_counts = std::collections::HashMap::new();
    for word in &words {
      *word_counts.entry(word.to_lowercase()).or_insert(0) += 1;
    }

    for count in word_counts.values() {
      if *count as f32 / words.len() as f32 > 0.6 {
        tracing::debug!("Rechazado por repetición de palabras: '{}'", text_trimmed);
        return false;
      }
    }
  }

  // NUEVO: Rechazar si tiene muy pocas vocales (ratio consonantes/vocales anormal)
  let vowels = "aeiouáéíóúäëïöüAEIOUÁÉÍÓÚÄËÏÖÜ";
  let vowel_count = text_trimmed.chars().filter(|c| vowels.contains(*c)).count();
  let letter_count = text_trimmed.chars().filter(|c| c.is_alphabetic()).count();

  if letter_count > 0 {
    let vowel_ratio = vowel_count as f32 / letter_count as f32;
    // El español tiene ~45% vocales, rechazar si es < 15% (ruido) o > 85% (repeticiones como "aaa")
    if vowel_ratio < 0.15 || vowel_ratio > 0.85 {
      tracing::debug!(
        "Rechazado por ratio de vocales anormal ({:.2}): '{}'",
        vowel_ratio,
        text_trimmed
      );
      return false;
    }
  }

  // Rechazar si tiene muchos caracteres extraños consecutivos
  let weird_chars = text_trimmed
    .chars()
    .filter(|c| !c.is_alphanumeric() && !c.is_whitespace() && *c != ',' && *c != '.' && *c != '?' && *c != '!')
    .count();
  if weird_chars as f32 / text_trimmed.len() as f32 > 0.3 {
    tracing::debug!("Rechazado por caracteres extraños: '{}'", text_trimmed);
    return false;
  }

  // NUEVO: Rechazar interjecciones y sonidos sin sentido comunes
  let noise_words = [
    "ah", "eh", "mm", "mmm", "mmmm", "uh", "uhm", "em", "hmm", "hm", "aah", "eeh", "ooh", "ugh", "huh", "shh", "psst",
    "aaah", "eeeh", "oooh", "uuuh",
  ];

  let text_lower = text_trimmed.to_lowercase();

  // Si TODA la transcripción es solo una interjección, rechazar
  if noise_words.contains(&text_lower.as_str()) {
    tracing::debug!("Rechazado por interjección pura: '{}'", text_trimmed);
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
    "applause", // Whisper multilingüe a veces transcribe aplausos
    "[applause]",
    "(applause)",
    "♪", // Notas musicales
  ];

  for pattern in &suspicious_patterns {
    if text_lower.contains(pattern) {
      tracing::debug!("Rechazado por patrón sospechoso '{}': '{}'", pattern, text_trimmed);
      return false;
    }
  }

  true
}

/// Post-procesa la transcripción para limpiar artefactos comunes
fn post_process_transcription(text: &str) -> String {
  let mut result = text.trim().to_string();

  // 1. Eliminar espacios múltiples
  while result.contains("  ") {
    result = result.replace("  ", " ");
  }

  // 2. Limpiar puntuación duplicada
  result = result.replace("...", ".");
  result = result.replace("..", ".");
  result = result.replace(",,", ",");
  result = result.replace("!!", "!");
  result = result.replace("??", "?");

  // 3. Capitalizar primera letra si es minúscula
  if let Some(first_char) = result.chars().next() {
    if first_char.is_lowercase() {
      let mut chars = result.chars();
      chars.next(); // Saltar primera
      result = first_char.to_uppercase().collect::<String>() + chars.as_str();
    }
  }

  // 4. Eliminar espacios antes de puntuación
  result = result.replace(" .", ".");
  result = result.replace(" ,", ",");
  result = result.replace(" !", "!");
  result = result.replace(" ?", "?");

  // 5. Agregar punto final si no tiene puntuación terminal
  if !result.is_empty() {
    let last_char = result.chars().last().unwrap();
    if !['.', '!', '?'].contains(&last_char) {
      result.push('.');
    }
  }

  result
}

// helper ms pretty
fn ms(d: Duration) -> f32 {
  (d.as_secs_f64() * 1000.0) as f32
}

/// Procesa un chunk de audio para transcripción parcial (streaming) - NUEVO
async fn process_streaming_chunk(
  state: &mut whisper_rs::WhisperState,
  params: &FullParams<'_, '_>,
  audio_chunk: &[f32],
  ctx: &mut StreamingContext,
  stt_tx: &UnboundedSender<SttMsg>,
) -> Result<()> {
  let chunk_secs = audio_chunk.len() as f32 / 16_000.0;

  tracing::debug!("🎬 Procesando chunk parcial ({:.2}s de audio)...", chunk_secs);

  // Cronometrar Whisper
  let t0 = Instant::now();
  let res = tokio::task::block_in_place(|| state.full(params.clone(), audio_chunk));
  let dt = t0.elapsed();

  if let Err(e) = res {
    tracing::warn!("whisper chunk error: {e:#}");
    return Ok(()); // No es fatal, continuamos
  }

  tracing::debug!("⚡ Whisper chunk completado en {:.0}ms", ms(dt));

  // Construir transcripción parcial
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

  // Validar
  if transcription.is_empty() {
    tracing::trace!("Transcripción parcial vacía - ignorando");
    return Ok(());
  }

  // Contar palabras
  let word_count = transcription.split_whitespace().count();

  // Solo enviar si hay cambio significativo (al menos una palabra nueva)
  if word_count > ctx.last_word_count {
    // Post-procesar (sin punto final, es parcial)
    let mut cleaned = transcription.trim().to_string();

    // Capitalizar primera letra
    if let Some(first_char) = cleaned.chars().next() {
      if first_char.is_lowercase() {
        let mut chars = cleaned.chars();
        chars.next();
        cleaned = first_char.to_uppercase().collect::<String>() + chars.as_str();
      }
    }

    // Actualizar contexto
    ctx.last_partial_text = cleaned.clone();
    ctx.last_word_count = word_count;
    ctx.last_update_time = Instant::now();

    // Enviar como PARTIAL
    tracing::info!("📨 Transcripción parcial ({} palabras): '{}'", word_count, cleaned);
    let _ = stt_tx.send(SttMsg::Partial { text: cleaned });
  } else {
    tracing::trace!("Sin palabras nuevas ({} palabras), skip update", word_count);
  }

  Ok(())
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

  // Validar
  if transcription.is_empty() {
    tracing::debug!("Transcripción vacía - ignorando");
    return;
  }

  if !is_valid_transcription(&transcription) {
    tracing::debug!("Transcripción inválida (filtrada): '{}'", transcription);
    return;
  }

  // Post-procesar para limpiar artefactos
  let transcription_cleaned = post_process_transcription(&transcription);

  // Validar nuevamente después del post-procesamiento (puede haber cambiado)
  if !is_valid_transcription(&transcription_cleaned) {
    tracing::debug!("Transcripción inválida post-limpieza: '{}'", transcription_cleaned);
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
  tracing::info!("📝 Transcripción: '{}'", transcription_cleaned);
  let _ = stt_tx.send(SttMsg::Final {
    text: transcription_cleaned,
  });
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

  // Parámetros críticos para filtrar ruido (BALANCEADOS para MVP)
  params.set_temperature(0.0); // IMPORTANTE: Sin sampling aleatorio = más determinístico y confiable
  params.set_entropy_thold(2.2); // BALANCEADO: Rechaza ruido pero acepta voz clara
  params.set_logprob_thold(-0.7); // BALANCEADO: Buena confianza sin ser extremo
  params.set_no_speech_thold(0.70); // BALANCEADO: Detecta bien el silencio

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
  let mut spectral_memory = SpectralMemory { prev_spectrum: None };

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
            let has_speech = !is_silence(&vad_window, &mut spectral_memory);

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
                            streaming_ctx: StreamingContext::new(), // NUEVO: Inicializar contexto de streaming
                        };
                    }
                }

                // ===== ESTADO: ACUMULANDO VOZ =====
                SpeechState::AccumulatingSpeech { ref phrase_start, ref mut last_speech_time, ref mut streaming_ctx } => {
                    if has_speech {
                        // Actualizar tiempo de última voz
                        *last_speech_time = Instant::now();
                    }

                    // NUEVO: Check si debemos enviar transcripción parcial (streaming)
                    if STREAMING_ENABLED && has_speech {
                        let audio_duration_ms = {
                            let g = pcm_buf.lock().await;
                            (g.len() as f32 / 16.0) as u64 // 16 samples/ms at 16kHz
                        };

                        // Solo procesar si tenemos suficiente audio
                        if audio_duration_ms >= STREAMING_MIN_AUDIO_MS {
                            // Verificar si debemos enviar update
                            if streaming_ctx.should_send_update(streaming_ctx.last_word_count + 1) {
                                tracing::debug!("🔄 Streaming: Procesando chunk parcial...");

                                // Clonar buffer actual para procesamiento
                                let current_buffer = {
                                    let g = pcm_buf.lock().await;
                                    g.clone()
                                };

                                // Procesar chunk para transcripción parcial
                                if let Err(e) = process_streaming_chunk(
                                    &mut state,
                                    &params,
                                    &current_buffer,
                                    streaming_ctx,
                                    &stt_tx,
                                ).await {
                                    tracing::warn!("Error procesando chunk streaming: {e:#}");
                                }
                            }
                        }
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

                        // Procesar frase ahora
                        if phrase_audio.len() as f32 / 16_000.0 >= MIN_PHRASE_DURATION_MS as f32 / 1000.0 {
                            process_complete_phrase(
                                &mut state,
                                &params,
                                &phrase_audio,
                                &stt_tx,
                                &first_audio_at,
                                &mut first_phrase_logged,
                            ).await;
                        }

                        // Limpiar buffer y volver a silencio
                        {
                            let mut g = pcm_buf.lock().await;
                            g.clear();
                        }
                        speech_state = SpeechState::Silence;
                        continue;
                    }

                    // Condición: Fin de frase (silencio > 800ms)
                    if silence_duration.as_millis() >= PHRASE_END_SILENCE_MS as u128 {
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

                        // Procesar solo si cumple duración mínima
                        if phrase_duration.as_millis() >= MIN_PHRASE_DURATION_MS as u128 {
                            process_complete_phrase(
                                &mut state,
                                &params,
                                &phrase_audio,
                                &stt_tx,
                                &first_audio_at,
                                &mut first_phrase_logged,
                            ).await;
                        } else {
                            tracing::debug!("Frase muy corta ({:.0}ms) - ignorando", phrase_duration.as_millis());
                        }

                        // Limpiar y volver a silencio
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

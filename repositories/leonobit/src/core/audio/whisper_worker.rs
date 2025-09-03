use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};
use whisper_rs::{DtwMode, DtwModelPreset, FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::core::audio::opus::Opus48k;
use crate::core::audio::resample::Resampler48kTo16k;
use crate::core::audio::stt::SttMsg;

// ====== Ventanas / hop a 16 kHz ======
const WINDOW_SAMPLES_16K: usize = 80_000; // ~5.0 s
const HOP_SAMPLES_16K: usize = 8_000; // ~0.5 s
const TAIL_AFTER_FINAL_16K: usize = 32_000; // ~2.0 s de “cola” tras final

// ====== VAD simple por RMS ======
const SILENCE_THRESHOLD_RMS: f32 = 6e-4;
const SILENCE_HOLDOFF_MS: u64 = 600;

fn is_silence(samples: &[f32], thr: f32) -> bool {
  if samples.is_empty() {
    return false;
  }
  let acc: f32 = samples.iter().map(|x| x * x).sum();
  let rms = (acc / samples.len() as f32).sqrt();
  rms < thr
}

/// Worker: recibe frames Opus 48k mono, decodifica → 16k mono → Whisper,
/// y emite **parciales** y **finales** como JSON a través de `tx_text`.
pub async fn run_whisper_worker(
  mut rx_opus: UnboundedReceiver<Vec<u8>>,
  stt_tx: UnboundedSender<SttMsg>,
  model_path: &str,
) -> Result<()> {
  // ---------- Contexto Whisper ----------
  let mut ctx_params = WhisperContextParameters::default();
  ctx_params.dtw_parameters.mode = DtwMode::ModelPreset {
    model_preset: DtwModelPreset::BaseEn,
  };
  let ctx = WhisperContext::new_with_params(model_path, ctx_params).context("cargar modelo whisper")?;
  let mut state = ctx.create_state().context("crear whisper state")?;

  // ---------- Audio: Opus + Resampler ----------
  let mut opus = Opus48k::new(true).context("crear decoder opus 48k")?;
  let mut resampler = Resampler48kTo16k::new().context("crear resampler 48k→16k")?;

  // ---------- Parámetros Whisper ----------
  let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 0 });
  params.set_n_threads(1);
  params.set_translate(false);
  params.set_language(None); // Detectar idioma automáticamente
  params.set_print_special(false);
  params.set_print_progress(false);
  params.set_print_realtime(false);
  params.set_print_timestamps(true); // útil para segmentación
  params.set_token_timestamps(true); // útil para DTW

  // ---------- Estado para parciales ----------
  let mut pcm16_acc: Vec<f32> = Vec::new(); // acumulador de ventana 16k
  let mut since_last_infer: usize = 0;
  let mut last_partial = String::new();
  let mut last_partial_at = Instant::now();

  // ---------- Bucle principal ----------
  while let Some(opus_frame) = rx_opus.recv().await {
    // 1) Opus → PCM 48k (posible estéreo)
    let (pcm48, _nsamp) = opus.decode(&opus_frame).context("decodificar opus 48k")?;
    if pcm48.is_empty() {
      continue;
    }

    // 1.1) Downmix si vino estéreo (resampler es 1 canal)
    let pcm48_mono = if opus.is_stereo() {
      Opus48k::downmix_stereo_to_mono(&pcm48)
    } else {
      pcm48
    };

    // 2) 48k → 16k
    let pcm16_chunk = resampler.process(&pcm48_mono).context("resample 48k→16k")?;
    if pcm16_chunk.is_empty() {
      continue;
    }

    // 3) Acumular y limitar ventana
    pcm16_acc.extend_from_slice(&pcm16_chunk);
    if pcm16_acc.len() > WINDOW_SAMPLES_16K {
      let cut = pcm16_acc.len() - WINDOW_SAMPLES_16K;
      pcm16_acc.drain(..cut);
    }
    since_last_infer += pcm16_chunk.len();

    // 4) Inferencia cada ~0.5s
    if since_last_infer >= HOP_SAMPLES_16K {
      since_last_infer = 0;

      state.full(params.clone(), &pcm16_acc[..]).context("whisper full()")?;

      // Construir hipótesis parcial concatenando los segmentos actuales
      // Usamos la API por iterador (estable en 0.15.x) para evitar
      // llamadas a métodos full_* que pueden variar entre versiones.
      let mut hypo = String::new();
      for seg in state.as_iter() {
        let seg_txt = seg.to_string();
        let seg_txt = seg_txt.trim();
        if !seg_txt.is_empty() {
          if !hypo.is_empty() {
            hypo.push(' ');
          }
          hypo.push_str(seg_txt);
        }
      }

      // Emitir PARCIAL si cambió
      if !hypo.is_empty() && hypo != last_partial {
        let _ = stt_tx.send(SttMsg::Partial { text: hypo.clone() });
        last_partial = hypo;
        last_partial_at = Instant::now();
      }

      // Confirmar FINAL si hay silencio sostenido y teníamos parcial
      if is_silence(&pcm16_chunk, SILENCE_THRESHOLD_RMS)
        && last_partial_at.elapsed() > Duration::from_millis(SILENCE_HOLDOFF_MS)
        && !last_partial.is_empty()
      {
        let final_text = std::mem::take(&mut last_partial);
        let _ = stt_tx.send(SttMsg::Final { text: final_text });

        // Mantener “cola” para continuidad de contexto
        if pcm16_acc.len() > TAIL_AFTER_FINAL_16K {
          let keep_from = pcm16_acc.len() - TAIL_AFTER_FINAL_16K;
          pcm16_acc.drain(..keep_from);
        }
        last_partial_at = Instant::now();
      }
    }
  }

  Ok(())
}

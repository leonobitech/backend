use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use tokio::sync::mpsc::{Receiver, UnboundedSender};
use tokio::sync::Mutex;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext};

use crate::core::audio::opus::Opus48k;
use crate::core::audio::resample::Resampler48kTo16k;
use crate::core::audio::stt::SttMsg;

// ====== Ventanas / hop a 16 kHz (reactivo) ======
const WINDOW_SAMPLES_16K: usize = 24_000; // ~1.5 s
const HOP_SAMPLES_16K: usize = 2_560; // ~160 ms
const MIN_SAMPLES_FOR_INFER_16K: usize = 8_000; // ~0.5 s
const TAIL_AFTER_FINAL_16K: usize = 12_000; // ~0.75 s

// ====== VAD simple por RMS ======
const SILENCE_THRESHOLD_RMS: f32 = 6e-4;
const SILENCE_HOLDOFF_MS: u64 = 450;

fn is_silence(samples: &[f32], thr: f32) -> bool {
  if samples.is_empty() {
    return false;
  }
  let acc: f32 = samples.iter().map(|x| x * x).sum();
  let rms = (acc / samples.len() as f32).sqrt();
  rms < thr
}

/// Task A (ingest): RTP Opus → 48k → 16k → buffer compartido
/// Task B (infer): cada ~320 ms toma tail (<=3.0s), corre Whisper y emite parciales/finales
pub async fn run_whisper_worker(
  mut rx_opus: Receiver<Vec<u8>>,
  stt_tx: UnboundedSender<SttMsg>,
  ctx: Arc<WhisperContext>,
) -> Result<()> {
  // ---------- Estado Whisper ----------
  let mut state = ctx.create_state().context("crear whisper state")?;

  // ---------- Audio helpers (solo ingest) ----------
  let mut opus = Opus48k::new(true).context("crear decoder opus 48k")?;
  let mut resampler = Resampler48kTo16k::new().context("crear resampler 48k→16k")?;

  // ---------- Parámetros Whisper (inglés, sin timestamps) ----------
  let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 0 });

  // Usa núcleos disponibles menos 1 (deja 1 libre para el resto del runtime)
  let n_logical = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
  let n_threads = (n_logical.saturating_sub(1).max(1)) as i32;
  params.set_n_threads(n_threads);
  params.set_translate(false);
  params.set_language(Some("es"));
  params.set_print_special(false);
  params.set_print_progress(false);
  params.set_print_realtime(false);
  params.set_print_timestamps(false); // menos trabajo
  params.set_token_timestamps(false); // menos trabajo

  // ---------- Buffer PCM16 compartido ----------
  let pcm_buf: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::with_capacity(WINDOW_SAMPLES_16K)));

  // ===== Task A: Ingestión =====
  let pcm_buf_ing = Arc::clone(&pcm_buf);
  let mut ingest_handle = tokio::spawn(async move {
    while let Some(opus_frame) = rx_opus.recv().await {
      // Opus → 48k
      let (pcm48, _nsamp) = match opus.decode(&opus_frame) {
        Ok(x) => x,
        Err(e) => {
          tracing::warn!("decodificar opus 48k: {e:#}");
          continue;
        }
      };
      if pcm48.is_empty() {
        continue;
      }

      // Downmix si viniera estéreo
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
      if pcm16_chunk.is_empty() {
        continue;
      }

      // Append + recorte a ventana
      let mut g = pcm_buf_ing.lock().await;
      g.extend_from_slice(&pcm16_chunk);
      if g.len() > WINDOW_SAMPLES_16K {
        let cut = g.len() - WINDOW_SAMPLES_16K;
        g.drain(..cut);
      }
    }
    tracing::info!("ingest task finished");
  });

  // ===== Task B: Inferencia periódica =====
  let mut last_partial = String::new();
  let mut last_partial_at = Instant::now();

  let hop_ms = (1000.0 * HOP_SAMPLES_16K as f32 / 16_000.0) as u64;
  let mut tick = tokio::time::interval(Duration::from_millis(hop_ms));
  tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

  loop {
    tokio::select! {
      // Si termina ingestión (se cerró el canal), salimos
      res = &mut ingest_handle => {
        if let Err(e) = res {
          tracing::warn!("ingest join error: {e:#}");
        }
        break;
      }

      // Tick de inferencia
      _ = tick.tick() => {
        // Snapshot del tail
        let tail: Vec<f32> = {
          let g = pcm_buf.lock().await;
          if g.len() < MIN_SAMPLES_FOR_INFER_16K {
            // Aún no hay audio suficiente para evitar assert interno de whisper
            continue;
          }
          g.clone()
        };

        // Inferencia sin bloquear el runtime (sección de cómputo pesado)
        if let Err(e) = tokio::task::block_in_place(|| {
          state.full(params.clone(), &tail[..]).context("whisper full()")
        }) {
          tracing::error!("whisper full error: {e:#}");
          continue;
        }

        // Hipótesis parcial
        let mut hypo = String::new();
        for seg in state.as_iter() {
          let mut seg_txt = seg.to_string();
          seg_txt = seg_txt.trim().to_string();
          if seg_txt.is_empty() || seg_txt == "[BLANK_AUDIO]" { continue; }
          if !hypo.is_empty() { hypo.push(' '); }
          hypo.push_str(&seg_txt);
        }

        if !hypo.is_empty() && hypo != last_partial {
          let _ = stt_tx.send(SttMsg::Partial { text: hypo.clone() });
          last_partial = hypo;
          last_partial_at = Instant::now();
        }

        // VAD para FINAL (mira ~0.25 s del final)
        let vad_window = tail.get(tail.len().saturating_sub(4_000)..).unwrap_or(&tail[..]);
        if is_silence(vad_window, SILENCE_THRESHOLD_RMS)
          && !last_partial.is_empty()
          && last_partial_at.elapsed() > Duration::from_millis(SILENCE_HOLDOFF_MS)
        {
          let final_text = std::mem::take(&mut last_partial);
          let _ = stt_tx.send(SttMsg::Final { text: final_text });

          // Mantener “cola” corta en el buffer compartido para continuidad
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

// src/core/audio/resample.rs
use anyhow::{Context, Result};
use rubato::{FftFixedInOut, Resampler};

/// Resampler 48k → 16k (mono). Mantiene un buffer interno para no perder muestras.
pub struct Resampler48kTo16k {
  inner: FftFixedInOut<f32>,
  in_buf: Vec<Vec<f32>>,
  pending: Vec<f32>, // buffer para muestras que no alcanzan el chunk de 480
}

impl Resampler48kTo16k {
  pub fn new() -> Result<Self> {
    // rubato 0.16.2: (in_rate, out_rate, chunk_size, n_channels)
    // 48000 → 16000, hop de 480 frames, 1 canal
    let inner = FftFixedInOut::new(48_000, 16_000, 480, 1).context("crear resampler 48k→16k")?;
    Ok(Self {
      inner,
      in_buf: vec![Vec::new()],
      pending: Vec::new(),
    })
  }

  pub fn process(&mut self, pcm48_mono: &[f32]) -> Result<Vec<f32>> {
    let chunk = 480;
    let mut out = Vec::new();

    // Combinar pending + nuevas muestras
    self.pending.extend_from_slice(pcm48_mono);

    // Procesar todos los chunks completos de 480 muestras
    let mut i = 0;
    while i + chunk <= self.pending.len() {
      self.in_buf[0].clear();
      self.in_buf[0].extend_from_slice(&self.pending[i..i + chunk]);

      // process: devuelve Vec<Vec<f32>> por canal
      let buf_out = self.inner.process(&self.in_buf, None).context("resample")?;
      out.extend_from_slice(&buf_out[0]);
      i += chunk;
    }

    // Mantener las muestras sobrantes para el próximo frame
    if i < self.pending.len() {
      self.pending.drain(..i);
    } else {
      self.pending.clear();
    }

    Ok(out)
  }
}

use anyhow::{Context, Result};
use audiopus::coder::Decoder as OpusDecoder;
use audiopus::{Channels, SampleRate};

/// Decodificador Opus 48k configurable en mono/estéreo.
/// Entrega PCM f32 intercalado si estéreo, rango [-1,1].
pub struct Opus48k {
    dec: OpusDecoder,
    buf_i16: Vec<i16>,
    stereo: bool,
}

impl Opus48k {
    pub fn new(stereo: bool) -> Result<Self> {
        let ch = if stereo {
            Channels::Stereo
        } else {
            Channels::Mono
        };
        let dec = OpusDecoder::new(SampleRate::Hz48000, ch).context("crear OpusDecoder")?;
        Ok(Self {
            dec,
            buf_i16: vec![0i16; 4096],
            stereo,
        })
    }

    pub fn is_stereo(&self) -> bool {
        self.stereo
    }

    /// Decodifica un payload Opus → PCM f32 (48k).
    /// Devuelve (vec, n_muestras_validas).
    pub fn decode(&mut self, opus_payload: &[u8]) -> Result<(Vec<f32>, usize)> {
        let samples = self
            .dec
            .decode(opus_payload, &mut self.buf_i16, false)
            .context("opus decode")?;
        let mut out = Vec::with_capacity(samples);
        for &s in &self.buf_i16[..samples] {
            out.push(s as f32 / 32768.0);
        }
        Ok((out, samples))
    }

    /// Downmix estéreo → mono (promedio L/R). Entrada intercalada.
    pub fn downmix_stereo_to_mono(pcm: &[f32]) -> Vec<f32> {
        let mut mono = Vec::with_capacity(pcm.len() / 2);
        let mut i = 0usize;
        while i + 1 < pcm.len() {
            mono.push((pcm[i] + pcm[i + 1]) * 0.5);
            i += 2;
        }
        mono
    }
}

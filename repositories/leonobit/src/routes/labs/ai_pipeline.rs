//! ai_pipeline.rs
//!
//! Pipeline de AI para Lab-05:
//!   - STT: Whisper (whisper-rs) sobre PCM 16k mono (f32).
//!   - LLM: OpenAI GPT-4o (async-openai).
//!   - TTS: ElevenLabs (reqwest), salida PCM 16k mono (bytes).
//!
//! Notas importantes:
//! - WebRTC nos entrega audio a 48 kHz estéreo (Opus). Para Whisper necesitamos PCM mono 16 kHz.
//! - En esta etapa proveemos utilidades mínimas para downmix + re-muestreo simple.
//!   (⚠️ Suficiente para pruebas; para producción usa un resampler de calidad.)
//! - La conversión Opus→PCM no se hace aquí (recomendado usar `audiopus` en otra etapa).
//! - Este módulo asume que ya recibís `Vec<f32>` en 48 kHz estéreo o 16 kHz mono según tu hook.

use std::sync::Arc;
use tracing::{info, warn};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperState};

use async_openai::types::{
    ChatCompletionResponse, CreateChatCompletionRequestArgs,
    ChatCompletionRequestMessageArgs, Role,
};
use async_openai::Client as OpenAIClient;

use reqwest::Client as HttpClient;

/// Alias de error genérico sin dependencias extra.
type BoxError = Box<dyn std::error::Error + Send + Sync>;

/// Estructura principal del pipeline.
pub struct AiPipeline {
    whisper_ctx: Arc<WhisperContext>,
    openai: OpenAIClient,
    http: HttpClient,
    elevenlabs_api_key: String,
    elevenlabs_voice_id: String,
}

impl AiPipeline {
    /// Crea una nueva instancia.
    ///
    /// - `whisper_model_path`: ruta local al modelo ggml (ej: "models/ggml-base.en.bin")
    /// - `elevenlabs_api_key`: API key (env: ELEVENLABS_API_KEY)
    /// - `elevenlabs_voice_id`: Voice ID (env: ELEVENLABS_VOICE_ID, por defecto "Rachel")
    pub fn new(
        whisper_model_path: &str,
        elevenlabs_api_key: String,
    ) -> Result<Self, BoxError> {
        let whisper_ctx = Arc::new(
            WhisperContext::new(whisper_model_path)
                .map_err(|e| format!("Error cargando modelo Whisper: {:?}", e))?,
        );

        let openai = OpenAIClient::new();
        let http = HttpClient::new();

        // Voice por defecto si no hay env
        let elevenlabs_voice_id = std::env::var("ELEVENLABS_VOICE_ID")
            .unwrap_or_else(|_| "Rachel".to_string());

        Ok(Self {
            whisper_ctx,
            openai,
            http,
            elevenlabs_api_key,
            elevenlabs_voice_id,
        })
    }

    // ------------------------------------------------------------------------
    // STT (Whisper)
    // ------------------------------------------------------------------------

    /// Transcribe un buffer PCM (f32).
    ///
    /// Entradas esperadas:
    /// - Si `sample_rate_hz == 48000` y `channels == 2`: haremos downmix a mono y
    ///   remuestreo tosco a 16k para Whisper.
    /// - Si ya viene `16 kHz mono`: lo pasamos directo.
    ///
    /// `pcm` debe estar normalizado en [-1.0, 1.0].
    pub fn transcribe_audio(
        &self,
        pcm: &[f32],
        sample_rate_hz: u32,
        channels: u16,
    ) -> Result<String, BoxError> {
        // 1) Normalizar a 16 kHz mono
        let mono_16k = match (sample_rate_hz, channels) {
            (16000, 1) => pcm.to_vec(),
            (48000, 2) => {
                let mono_48k = downmix_stereo_to_mono(pcm);
                naive_resample_48k_to_16k(&mono_48k)
            }
            (sr, ch) => {
                warn!("STT: ruta no optimizada sr={sr} ch={ch}, aplicando fallback simple");
                if ch == 2 {
                    let mono = downmix_stereo_to_mono(pcm);
                    naive_resample_to_16k(&mono, sr)
                } else {
                    naive_resample_to_16k(pcm, sr)
                }
            }
        };

        // 2) Correr whisper full (bloqueante, pero rápido en modelos pequeños)
        let mut state = self.new_whisper_state()?;
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_n_threads(4);
        params.set_translate(false);
        params.set_language(Some("es")); // ajustá a "auto" o "en" según casos
        params.set_no_context(true);
        params.set_single_segment(false); // permitir múltiples segmentos
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_special(false);

        // IMPORTANT: whisper-rs espera f32 a 16 kHz
        state.full(params, &mono_16k)
            .map_err(|e| format!("Whisper full() error: {:?}", e))?;

        // 3) Armar el texto resultante a partir de segments
        let num_segments = state.full_n_segments().unwrap_or(0);
        let mut out = String::new();
        for i in 0..num_segments {
            if let Ok(seg) = state.full_get_segment_text(i) {
                if !out.is_empty() { out.push(' '); }
                out.push_str(seg.trim());
            }
        }

        Ok(out)
    }

    fn new_whisper_state(&self) -> Result<WhisperState, BoxError> {
        self.whisper_ctx
            .create_state()
            .map_err(|e| format!("Error creando estado de Whisper: {:?}", e).into())
    }

    // ------------------------------------------------------------------------
    // LLM (OpenAI GPT-4o)
    // ------------------------------------------------------------------------

    /// Genera una respuesta de chat con GPT-4o.
    pub async fn generate_response(&self, input_text: &str) -> Result<String, BoxError> {
        let user_msg = ChatCompletionRequestMessageArgs::default()
            .role(Role::User)
            .content(input_text)
            .build()?;

        let req = CreateChatCompletionRequestArgs::default()
            .model("gpt-4o")
            .messages(vec![user_msg])
            .build()?;

        let resp: ChatCompletionResponse = self.openai.chat().create(req).await?;
        let out = resp
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .unwrap_or_default();

        Ok(out)
    }

    // ------------------------------------------------------------------------
    // TTS (ElevenLabs)
    // ------------------------------------------------------------------------

    /// Sintetiza voz con ElevenLabs y devuelve **PCM 16 kHz mono** (bytes crudos).
    ///
    /// Configurable por ENV:
    /// - ELEVENLABS_API_KEY (obligatoria)
    /// - ELEVENLABS_VOICE_ID (opcional, default "Rachel")
    ///
    /// Para otros formatos (`mp3_44100_128`, `pcm_22050` ...) ajustar "output_format".
    pub async fn synthesize_audio(&self, text: &str) -> Result<Vec<u8>, BoxError> {
        let url = format!(
            "https://api.elevenlabs.io/v1/text-to-speech/{}",
            self.elevenlabs_voice_id
        );

        #[derive(serde::Serialize)]
        struct TtsBody<'a> {
            text: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            model_id: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            voice_settings: Option<VoiceSettings>,
            output_format: &'a str,
        }

        #[derive(serde::Serialize)]
        struct VoiceSettings {
            stability: f32,
            similarity_boost: f32,
            #[serde(skip_serializing_if = "Option::is_none")]
            style: Option<f32>,
            #[serde(skip_serializing_if = "Option::is_none")]
            use_speaker_boost: Option<bool>,
        }

        // Formato PCM 16k mono (little-endian). Ajustable según tu pipeline.
        let body = TtsBody {
            text,
            model_id: Some("eleven_multilingual_v2"), // opcional; podés cambiar a otro
            voice_settings: Some(VoiceSettings {
                stability: 0.5,
                similarity_boost: 0.75,
                style: None,
                use_speaker_boost: Some(true),
            }),
            output_format: "pcm_16000",
        };

        let resp = self.http
            .post(&url)
            .header("xi-api-key", &self.elevenlabs_api_key)
            .header("accept", "audio/wav") // ElevenLabs ignora esto si setean output_format
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("ElevenLabs TTS error {status}: {text}").into());
        }

        let bytes = resp.bytes().await?.to_vec();
        Ok(bytes)
    }
}

// ============================================================================
// Utilidades de audio (mínimas) para pruebas
// ============================================================================

/// Downmix estéreo a mono (promedio simple de L y R).
pub fn downmix_stereo_to_mono(stereo_48k: &[f32]) -> Vec<f32> {
    let mut out = Vec::with_capacity(stereo_48k.len() / 2);
    let mut i = 0;
    while i + 1 < stereo_48k.len() {
        let l = stereo_48k[i];
        let r = stereo_48k[i + 1];
        out.push(0.5 * (l + r));
        i += 2;
    }
    out
}

/// Re-muestreo tosco 48 kHz → 16 kHz (factor 3), por decimación.
/// ⚠️ Sólo para pruebas. Para producción usa un resampler FIR/bandlimited.
pub fn naive_resample_48k_to_16k(mono_48k: &[f32]) -> Vec<f32> {
    // Tomar 1 de cada 3 muestras (decimate). Sin anti-aliasing.
    let mut out = Vec::with_capacity(mono_48k.len() / 3);
    let mut i = 0usize;
    while i < mono_48k.len() {
        out.push(mono_48k[i]);
        i += 3;
    }
    out
}

/// Re-muestreo tosco a 16 kHz desde cualquier SR (nearest-neighbor).
/// ⚠️ Para producción, reemplazar por un resampler serio (e.g., rubato, speexdsp).
pub fn naive_resample_to_16k(input: &[f32], sr_in: u32) -> Vec<f32> {
    if sr_in == 16000 {
        return input.to_vec();
    }
    let ratio = 16000.0 / (sr_in as f32);
    let out_len = ((input.len() as f32) * ratio).round() as usize;
    let mut out = Vec::with_capacity(out_len);
    for n in 0..out_len {
        let src_idx = ((n as f32) / ratio).round() as usize;
        out.push(*input.get(src_idx.min(input.len().saturating_sub(1))).unwrap_or(&0.0));
    }
    out
}

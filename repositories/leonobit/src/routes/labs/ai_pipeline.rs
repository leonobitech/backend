//! ai_pipeline.rs
//! -------------------------------------------------------------
//! Pipeline:  STT (Whisper)  →  LLM (OpenAI Chat)  →  TTS (ElevenLabs)
//!
//! Versiones compatibles:
//!   - whisper-rs = "0.15.0"
//!   - async-openai = "0.29.1"
//!
//! Notas de API (whisper-rs 0.15):
//!   - Para obtener el texto, usar `state.get_segment(i)` (-> Option<WhisperSegment>)
//!     y luego `seg.to_str()` / `seg.to_str_lossy()`.
//!   - `full_n_segments()` devuelve i32 (no Result).
//!
//! Notas de API (async-openai 0.29):
//!   - Chat completions con `CreateChatCompletionRequestArgs`.
//!   - Los mensajes se construyen con el enum
//!     `ChatCompletionRequestMessage::User(ChatCompletionRequestUserMessageArgs{..}.build()?)`.
//!
//! Esta pieza no toca WebRTC directamente: se puede llamar desde lab05
//! para STT, generar la respuesta con GPT y sintetizar audio TTS.

use std::sync::Arc;

use async_openai::config::OpenAIConfig;
use async_openai::types::{
    ChatCompletionRequestMessage, ChatCompletionRequestUserMessageArgs,
    CreateChatCompletionRequestArgs,
};
use async_openai::Client as OpenAIClient;
use reqwest::Client as HttpClient;
use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState,
};

type BoxError = Box<dyn std::error::Error + Send + Sync>;

pub struct AiPipeline {
    // Modelo whisper.cpp cargado en memoria y compartido (thread-safe por estado).
    whisper_ctx: Arc<WhisperContext>,
    // Cliente OpenAI (chat).
    openai: OpenAIClient<OpenAIConfig>,
    // Cliente HTTP para ElevenLabs (y utilidades).
    http: HttpClient,
    // Credenciales/TTS
    elevenlabs_api_key: String,
    elevenlabs_voice_id: String,
}

impl AiPipeline {
    /// Crea la pipeline con:
    /// - `whisper_model_path`: ruta al modelo ggml (ej: /models/whisper/ggml-base.en.bin).
    /// - `elevenlabs_api_key`: API key de ElevenLabs (obligatoria).
    ///   (El voice_id se toma de ELEVENLABS_VOICE_ID o usa uno por defecto).
    pub fn new(whisper_model_path: &str, elevenlabs_api_key: String) -> Result<Self, BoxError> {
        // Cargar contexto Whisper con parámetros por defecto.
        let whisper_ctx = Arc::new(
            WhisperContext::new_with_params(
                whisper_model_path,
                WhisperContextParameters::default(),
            )
            .map_err(|e| format!("WhisperContext init: {:?}", e))?,
        );

        // Cliente OpenAI (toma OPENAI_API_KEY del entorno).
        let openai = OpenAIClient::new();

        // Cliente HTTP para TTS.
        let http = HttpClient::new();

        // Voz por defecto si no está seteada ELEVENLABS_VOICE_ID.
        let elevenlabs_voice_id = std::env::var("ELEVENLABS_VOICE_ID")
            .unwrap_or_else(|_| "EXAVITQu4vr4xnSDxMaL".to_string()); // "Rachel" común

        Ok(Self {
            whisper_ctx,
            openai,
            http,
            elevenlabs_api_key,
            elevenlabs_voice_id,
        })
    }

    /// Transcribe un buffer **PCM f32** a texto.
    ///
    /// - `pcm`: samples en f32 normalized [-1.0, 1.0].
    /// - `sample_rate_hz`: sample rate del buffer de entrada.
    /// - `channels`: 1 (mono) o 2 (stereo).
    ///
    /// Whisper espera 16 kHz mono, así que aquí **normalizamos**:
    ///  - downmix stereo → mono
    ///  - resample → 16k (métodos "naive" para prototipado)
    pub fn transcribe_audio(
        &self,
        pcm: &[f32],
        sample_rate_hz: u32,
        channels: u16,
    ) -> Result<String, BoxError> {
        // 1) Normalización a 16k mono (simple; suficiente para demo).
        let mono_16k: Vec<f32> = match (sample_rate_hz, channels) {
            (16000, 1) => pcm.to_vec(),
            (48000, 2) => {
                let mono_48k = downmix_stereo_to_mono(pcm);
                naive_resample_48k_to_16k(&mono_48k)
            }
            (sr, ch) => {
                if ch == 2 {
                    let mono = downmix_stereo_to_mono(pcm);
                    naive_resample_to_16k(&mono, sr)
                } else {
                    naive_resample_to_16k(pcm, sr)
                }
            }
        };

        // 2) Crear estado por invocación (thread-safe).
        let mut state: WhisperState = self
            .whisper_ctx
            .create_state()
            .map_err(|e| format!("Whisper create_state: {:?}", e))?;

        // 3) Parámetros de inferencia.
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_n_threads(4); // ajustar según CPU
        params.set_translate(false); // no traducir, solo transcribir
        params.set_language(Some("es")); // forzamos español (o "auto" si querés autodetección)
        params.set_no_context(true);
        params.set_single_segment(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_special(false);

        // 4) Ejecutar transcripción "full".
        state
            .full(params, &mono_16k)
            .map_err(|e| format!("Whisper full(): {:?}", e))?;

        // 5) Leer segmentos y concatenar texto.
        let num_segments = state.full_n_segments().max(0) as usize;
        let mut out = String::new();

        for i in 0..num_segments {
            if let Some(seg) = state.get_segment(i as i32) {
                // En 0.15.0 el texto del segmento se obtiene así:
                //   - `to_str()` (Result<&str, _>) o
                //   - `to_str_lossy()` (Result<Cow<str>, _>) → más tolerante.
                let seg_txt = match seg.to_str() {
                    Ok(s) => s.trim().to_owned(),
                    Err(_) => seg
                        .to_str_lossy()
                        .map(|cow| cow.trim().to_owned())
                        .unwrap_or_default(),
                };

                if !seg_txt.is_empty() {
                    if !out.is_empty() {
                        out.push(' ');
                    }
                    out.push_str(&seg_txt);
                }
            }
        }

        Ok(out)
    }

    /// Genera una respuesta breve con GPT-4o a partir de `input_text`.
    pub async fn generate_response(&self, input_text: &str) -> Result<String, BoxError> {
        // En 0.29.x, ChatCompletionRequestMessage es un enum; construimos el "User".
        let user_msg: ChatCompletionRequestMessage = ChatCompletionRequestMessage::User(
            ChatCompletionRequestUserMessageArgs::default()
                .content(input_text)
                .build()?,
        );

        let req = CreateChatCompletionRequestArgs::default()
            .model("gpt-4o")
            .messages(vec![user_msg])
            .build()?;

        let resp = self.openai.chat().create(req).await?;
        let out = resp
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .unwrap_or_default();

        Ok(out)
    }

    /// Sintetiza `text` con ElevenLabs y devuelve bytes PCM 16 kHz mono.
    ///
    /// ⚠️ En este ejemplo pedimos `output_format = "pcm_16000"`.
    ///    Si preferís WAV completo, cambiá `accept` y `output_format`.
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

        let body = TtsBody {
            text,
            model_id: Some("eleven_multilingual_v2"),
            voice_settings: Some(VoiceSettings {
                stability: 0.5,
                similarity_boost: 0.75,
                style: None,
                use_speaker_boost: Some(true),
            }),
            output_format: "pcm_16000",
        };

        let resp = self
            .http
            .post(&url)
            .header("xi-api-key", &self.elevenlabs_api_key)
            .header("accept", "application/octet-stream") // raw PCM
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let code = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("ElevenLabs TTS error {code}: {body}").into());
        }

        Ok(resp.bytes().await?.to_vec())
    }
}

/* ================== Utils de audio mínimas (prototipo) ==================
 * Estas rutinas son simples y suficientes para la POC.
 * Para producción, preferí un resampler de calidad (speexdsp, rubato, etc).
 */

// Mezcla L/R → mono (promedio simple)
pub fn downmix_stereo_to_mono(stereo: &[f32]) -> Vec<f32> {
    let mut out = Vec::with_capacity(stereo.len() / 2);
    let mut i = 0;
    while i + 1 < stereo.len() {
        out.push(0.5 * (stereo[i] + stereo[i + 1]));
        i += 2;
    }
    out
}

// Diezmado 48k → 16k (toma 1 de cada 3 muestras)
pub fn naive_resample_48k_to_16k(mono_48k: &[f32]) -> Vec<f32> {
    let mut out = Vec::with_capacity(mono_48k.len() / 3);
    let mut i = 0usize;
    while i < mono_48k.len() {
        out.push(mono_48k[i]);
        i += 3;
    }
    out
}

// Re-muestreo “a lo bruto” a 16k para cualquier SR (nearest neighbor)
pub fn naive_resample_to_16k(input: &[f32], sr_in: u32) -> Vec<f32> {
    if sr_in == 16000 {
        return input.to_vec();
    }
    let ratio = 16000.0 / (sr_in as f32);
    let out_len = ((input.len() as f32) * ratio).round() as usize;
    let mut out = Vec::with_capacity(out_len);
    for n in 0..out_len {
        let src_idx = ((n as f32) / ratio).round() as usize;
        out.push(
            *input
                .get(src_idx.min(input.len().saturating_sub(1)))
                .unwrap_or(&0.0),
        );
    }
    out
}

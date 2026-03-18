import asyncio
import io
import json
import logging
import wave
from pathlib import Path

import anthropic
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from faster_whisper import WhisperModel
from piper import PiperVoice
from piper.voice import SynthesisConfig

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice-spike")

# --- Config ---
WHISPER_MODEL = "small"
WHISPER_DEVICE = "cpu"
SILENCE_THRESHOLD_MS = 800
SAMPLE_RATE = 16000
FRAME_MS = 30
ENERGY_THRESHOLD = 200
PARTIAL_INTERVAL_MS = 600
PIPER_MODEL = Path(__file__).parent / "models" / "es_AR-daniela-high.onnx"

app = FastAPI(title="Voice Spike")

static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")

whisper_model: WhisperModel = None
piper_voice: PiperVoice = None
claude_client: anthropic.Anthropic = None


@app.on_event("startup")
async def load_models():
    global whisper_model, piper_voice, claude_client

    logger.info("Cargando Whisper...")
    whisper_model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type="int8")
    logger.info("Whisper cargado.")

    logger.info("Cargando Piper TTS...")
    piper_voice = PiperVoice.load(str(PIPER_MODEL))
    logger.info("Piper cargado.")

    claude_client = anthropic.Anthropic()
    logger.info("Claude client listo.")


@app.get("/")
async def index():
    return FileResponse(static_dir / "index.html")


@app.get("/health")
async def health():
    return {"status": "ok", "whisper": WHISPER_MODEL, "piper": "es_AR-daniela-high"}


# --- Audio utils ---

def resample(audio_int16: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    if orig_sr == target_sr:
        return audio_int16
    ratio = target_sr / orig_sr
    n_samples = int(len(audio_int16) * ratio)
    indices = np.arange(n_samples) / ratio
    indices_floor = np.floor(indices).astype(int)
    indices_floor = np.clip(indices_floor, 0, len(audio_int16) - 2)
    frac = indices - indices_floor
    resampled = (
        audio_int16[indices_floor] * (1 - frac)
        + audio_int16[indices_floor + 1] * frac
    )
    return resampled.astype(np.int16)


def is_speech(frame: np.ndarray, threshold: float = ENERGY_THRESHOLD) -> bool:
    energy = np.sqrt(np.mean(frame.astype(np.float32) ** 2))
    return energy > threshold


HALLUCINATION_FILTER = {
    "suscríbete", "suscribete", "subscribe", "gracias por ver",
    "subtítulos", "subtitulos", "thanks for watching",
    "subtítulos por", "like and subscribe", "música",
    "gracias por vernos", "hasta la próxima", "nos vemos",
}


def is_hallucination(text: str) -> bool:
    clean = text.lower().strip()
    for ch in ".,!¡¿?\"'()[]{}…—–-":
        clean = clean.replace(ch, "")
    clean = clean.strip()
    return clean in HALLUCINATION_FILTER or len(clean) < 3


def transcribe(audio_int16: np.ndarray) -> str:
    audio_f32 = audio_int16.astype(np.float32) / 32768.0
    segments, _ = whisper_model.transcribe(
        audio_f32, language="es", vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500, speech_pad_ms=200),
    )
    text = " ".join(seg.text.strip() for seg in segments)
    return text.strip()


def transcribe_partial(audio_int16: np.ndarray) -> str:
    audio_f32 = audio_int16.astype(np.float32) / 32768.0
    segments, _ = whisper_model.transcribe(
        audio_f32, language="es", vad_filter=True, beam_size=1,
    )
    text = " ".join(seg.text.strip() for seg in segments)
    return text.strip()


# --- LLM ---

def ask_claude(conversation: list[dict]) -> str:
    import time
    for attempt in range(3):
        try:
            response = claude_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                system="Eres un asistente de voz amigable. Responde de forma breve y natural, como en una conversación hablada. Máximo 2-3 oraciones. No uses markdown ni formato especial.",
                messages=conversation,
            )
            return response.content[0].text
        except Exception as e:
            logger.warning(f"Claude intento {attempt+1} falló: {e}")
            if attempt < 2:
                time.sleep(1)
    return "Disculpa, no pude procesar tu mensaje. ¿Podrías repetirlo?"


# --- TTS ---

PIPER_CONFIG = SynthesisConfig(
    length_scale=0.75,      # más rápido (conversacional)
    noise_scale=0.8,        # más expresivo
    noise_w_scale=0.6,      # variación natural en duración
)


def synthesize(text: str) -> bytes:
    """Genera WAV desde texto con Piper."""
    all_audio = []
    for chunk in piper_voice.synthesize(text, syn_config=PIPER_CONFIG):
        int16_audio = (chunk.audio_float_array * 32767).astype(np.int16)
        all_audio.append(int16_audio)

    if not all_audio:
        return b""

    audio_data = np.concatenate(all_audio)

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(piper_voice.config.sample_rate)
        wav_file.writeframes(audio_data.tobytes())

    return buffer.getvalue()


# --- WebSocket ---

@app.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket):
    await websocket.accept()
    logger.info("Cliente conectado")

    client_sample_rate = 48000
    audio_buffer: list[np.ndarray] = []
    is_speaking = False
    silence_frames = 0
    frames_for_silence = int(SILENCE_THRESHOLD_MS / FRAME_MS)

    # Partials
    frames_since_partial = 0
    frames_for_partial = int(PARTIAL_INTERVAL_MS / FRAME_MS)
    partial_task: asyncio.Task | None = None
    last_partial_text = ""

    # Conversación con Claude
    conversation: list[dict] = []

    # Barge-in se maneja del lado del browser

    async def send_partial(audio_snapshot: np.ndarray):
        nonlocal last_partial_text
        try:
            text = await asyncio.to_thread(transcribe_partial, audio_snapshot)
            if text and text != last_partial_text and not is_hallucination(text):
                last_partial_text = text
                await websocket.send_json({"type": "partial", "text": text})
        except Exception:
            pass

    try:
        while True:
            data = await websocket.receive()

            if "text" in data:
                msg = json.loads(data["text"])
                if msg.get("type") == "config":
                    client_sample_rate = msg.get("sampleRate", 48000)
                    logger.info(f"Sample rate del cliente: {client_sample_rate}")
                continue

            if "bytes" not in data:
                continue

            raw = data["bytes"]
            n_samples = len(raw) // 2
            audio_chunk = np.frombuffer(raw, dtype=np.int16, count=n_samples)
            chunk_16k = resample(audio_chunk, client_sample_rate, SAMPLE_RATE)

            frame_size = int(SAMPLE_RATE * FRAME_MS / 1000)

            for i in range(0, len(chunk_16k) - frame_size + 1, frame_size):
                frame = chunk_16k[i : i + frame_size]

                if is_speech(frame):
                    is_speaking = True
                    silence_frames = 0
                    audio_buffer.append(frame)
                    frames_since_partial += 1

                    if (
                        frames_since_partial >= frames_for_partial
                        and len(audio_buffer) > 5
                        and (partial_task is None or partial_task.done())
                    ):
                        frames_since_partial = 0
                        snapshot = np.concatenate(audio_buffer)
                        partial_task = asyncio.create_task(send_partial(snapshot))

                elif is_speaking:
                        silence_frames += 1
                        audio_buffer.append(frame)

                        if silence_frames >= frames_for_silence:
                            if partial_task and not partial_task.done():
                                partial_task.cancel()

                            if len(audio_buffer) > 10:
                                full_audio = np.concatenate(audio_buffer)
                                duration = len(full_audio) / SAMPLE_RATE
                                logger.info(f"Transcribiendo {duration:.1f}s...")

                                # 1. STT
                                user_text = await asyncio.to_thread(transcribe, full_audio)

                                if user_text and not is_hallucination(user_text):
                                    await websocket.send_json({
                                        "type": "final",
                                        "text": user_text,
                                    })
                                    logger.info(f"Usuario: {user_text}")

                                    # 2. LLM
                                    conversation.append({"role": "user", "content": user_text})
                                    await websocket.send_json({
                                        "type": "thinking",
                                        "text": "Pensando...",
                                    })

                                    ai_text = await asyncio.to_thread(ask_claude, conversation)
                                    conversation.append({"role": "assistant", "content": ai_text})
                                    logger.info(f"Claude: {ai_text}")

                                    await websocket.send_json({
                                        "type": "response",
                                        "text": ai_text,
                                    })

                                    # 3. TTS
                                    wav_bytes = await asyncio.to_thread(synthesize, ai_text)

                                    await websocket.send_bytes(wav_bytes)
                                    logger.info(f"Audio enviado: {len(wav_bytes)} bytes")

                            # Reset
                            audio_buffer = []
                            is_speaking = False
                            silence_frames = 0
                            frames_since_partial = 0
                            last_partial_text = ""
                            partial_task = None

    except WebSocketDisconnect:
        logger.info("Cliente desconectado")
    except Exception as e:
        logger.error(f"Error: {e}")
        await websocket.close()

import asyncio
import io
import json
import logging
import time
import traceback
import wave
from pathlib import Path

import anthropic
import numpy as np
from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    RTCIceCandidate,
    MediaStreamTrack,
    RTCConfiguration,
    RTCIceServer,
)
from aiortc.contrib.media import MediaRelay
from aiortc.mediastreams import MediaStreamError
from av import AudioFrame
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from faster_whisper import WhisperModel

# XTTS v2 TTS
import torch
original_torch_load = torch.load
def _patched_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return original_torch_load(*args, **kwargs)
torch.load = _patched_load

from TTS.api import TTS

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice-rtc")

# --- Config ---
WHISPER_MODEL = "small"
WHISPER_DEVICE = "cpu"
SILENCE_THRESHOLD_MS = 800
SAMPLE_RATE = 16000
FRAME_MS = 30
ENERGY_THRESHOLD = 200
XTTS_MODEL = "tts_models/multilingual/multi-dataset/xtts_v2"
XTTS_REF_VOICE = "/tmp/ref_male.wav"  # Referencia de voz generada con Piper davefx
XTTS_SAMPLE_RATE = 24000

app = FastAPI(title="Voice Spike RTC")

static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")

whisper_model: WhisperModel = None
xtts_model: TTS = None
claude_client: anthropic.Anthropic = None
pcs: set[RTCPeerConnection] = set()


@app.on_event("startup")
async def load_models():
    global whisper_model, xtts_model, claude_client

    logger.info("Cargando Whisper...")
    whisper_model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type="int8")
    logger.info("Whisper cargado.")

    logger.info("Cargando XTTS v2...")
    xtts_model = TTS(XTTS_MODEL, gpu=False)
    logger.info("XTTS v2 cargado.")

    claude_client = anthropic.Anthropic()
    logger.info("Claude client listo.")


@app.on_event("shutdown")
async def shutdown():
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()


@app.get("/")
async def index():
    return FileResponse(static_dir / "index_rtc.html")


@app.get("/health")
async def health():
    return {"status": "ok", "whisper": WHISPER_MODEL, "tts": "XTTS-v2", "transport": "webrtc"}


# --- Audio utils ---

HALLUCINATION_FILTER = {
    "suscríbete", "suscribete", "subscribe", "gracias por ver",
    "subtítulos", "subtitulos", "thanks for watching",
    "subtítulos por", "like and subscribe", "música",
    "gracias por vernos", "hasta la próxima", "nos vemos",
    "subtítulos por la comunidad de amaraorg",
    "subtítulos realizados por la comunidad de amaraorg",
    "amara org", "amaraorg",
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


def ask_claude(conversation: list[dict]) -> str:
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


def synthesize(text: str) -> tuple[np.ndarray, int]:
    """Genera audio int16 desde texto con XTTS v2. Retorna (audio, sample_rate)."""
    try:
        audio_list = xtts_model.tts(
            text=text,
            language="es",
            speaker_wav=XTTS_REF_VOICE,
        )

        audio_np = np.array(audio_list, dtype=np.float32)
        audio_int16 = (audio_np * 32767).astype(np.int16)

        return audio_int16, XTTS_SAMPLE_RATE

    except Exception as e:
        logger.error(f"XTTS error: {e}\n{traceback.format_exc()}")

    return np.array([], dtype=np.int16), XTTS_SAMPLE_RATE


# --- TTS Audio Track ---

class TTSTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self):
        super().__init__()
        self._samples_per_frame = 960  # 48kHz * 20ms
        self._pts = 0
        self._playing = False
        self._all_samples = np.array([], dtype=np.int16)
        self._read_pos = 0
        self._start_time = None
        self._frame_count = 0

    def enqueue_audio(self, audio_int16: np.ndarray, sample_rate: int):
        if sample_rate != 48000:
            ratio = 48000 / sample_rate
            n_samples = int(len(audio_int16) * ratio)
            indices = np.arange(n_samples) / ratio
            idx = np.clip(np.floor(indices).astype(int), 0, len(audio_int16) - 2)
            frac = indices - idx
            audio_int16 = (
                audio_int16[idx] * (1 - frac) + audio_int16[idx + 1] * frac
            ).astype(np.int16)

        self._all_samples = audio_int16
        self._read_pos = 0
        self._playing = True

    def stop_playback(self):
        self._all_samples = np.array([], dtype=np.int16)
        self._read_pos = 0
        self._playing = False
        logger.info("BARGE-IN: playback detenido")

    async def recv(self) -> AudioFrame:
        # Timing basado en reloj real (20ms por frame a 48kHz)
        self._frame_count += 1
        if self._start_time is None:
            self._start_time = time.time()

        target_time = self._start_time + (self._frame_count * self._samples_per_frame / 48000)
        now = time.time()
        wait = target_time - now
        if wait > 0:
            await asyncio.sleep(wait)

        samples = np.zeros(self._samples_per_frame, dtype=np.int16)

        if self._playing and self._read_pos < len(self._all_samples):
            end = min(self._read_pos + self._samples_per_frame, len(self._all_samples))
            chunk = self._all_samples[self._read_pos:end]
            samples[:len(chunk)] = chunk
            self._read_pos = end
            if self._read_pos >= len(self._all_samples):
                self._playing = False

        frame = AudioFrame(format="s16", layout="mono", samples=self._samples_per_frame)
        frame.rate = 48000
        frame.pts = self._pts
        self._pts += self._samples_per_frame
        frame.planes[0].update(samples.tobytes())

        return frame


# --- WebSocket Signaling + WebRTC ---

@app.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket conectado")

    pc = RTCPeerConnection(
        RTCConfiguration(
            iceServers=[
                RTCIceServer(urls=["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"])
            ]
        )
    )
    pcs.add(pc)

    # TTS track (server → browser)
    tts_track = TTSTrack()

    # Agregar transceiver sendrecv con nuestro TTS track
    transceiver = pc.addTransceiver(tts_track, direction="sendrecv")

    # Estado compartido
    state = {
        "conversation": [],
        "chat_dc": None,
    }

    # --- ICE candidates → enviar al browser por WebSocket ---
    @pc.on("icecandidate")
    async def on_ice_candidate(candidate):
        if candidate:
            await websocket.send_json({
                "kind": "webrtc.candidate",
                "candidate": {
                    "candidate": candidate.candidate,
                    "sdpMid": candidate.sdpMid,
                    "sdpMLineIndex": candidate.sdpMLineIndex,
                },
            })

    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        logger.info(f"Connection state: {pc.connectionState}")
        if pc.connectionState in ("failed", "closed"):
            await pc.close()
            pcs.discard(pc)

    # --- DataChannel recibido del browser ---
    @pc.on("datachannel")
    def on_datachannel(channel):
        logger.info(f"DataChannel recibido: {channel.label}")
        if channel.label == "chat":
            state["chat_dc"] = channel
        elif channel.label == "ctrl":
            @channel.on("message")
            def on_ctrl_msg(msg):
                if isinstance(msg, str) and msg.startswith("ping:"):
                    channel.send(f"pong:{msg[5:]}")

    # --- Audio track recibido del browser ---
    @pc.on("track")
    def on_track(track):
        logger.info(f"Track recibido: {track.kind}")
        if track.kind == "audio":
            asyncio.ensure_future(process_audio(track, tts_track, state))

    async def process_audio(track, tts_track, state):
        audio_buffer = []
        is_speaking = False
        silence_frames = 0
        barge_in_frames = 0
        frames_for_silence = int(SILENCE_THRESHOLD_MS / FRAME_MS)
        first_frame = True
        vad_debug = 0
        # Acumular samples antes de VAD (frames WebRTC son pequeños)
        pending_samples = np.array([], dtype=np.int16)

        try:
            while True:
                try:
                    frame = await asyncio.wait_for(track.recv(), timeout=30.0)
                except asyncio.TimeoutError:
                    continue
                except MediaStreamError:
                    logger.info("Audio track cerrado")
                    break

                # Debug primer frame
                if first_frame:
                    raw = frame.to_ndarray()
                    logger.info(f"Audio: format={frame.format.name}, rate={frame.rate}, "
                                f"samples={frame.samples}, layout={frame.layout.name}, "
                                f"shape={raw.shape}, min={raw.min()}, max={raw.max()}")
                    first_frame = False
                    frame_count = 0

                frame_count += 1
                if frame_count % 50 == 0:  # cada ~1 segundo
                    raw_peek = frame.to_ndarray()
                    logger.info(f"Frame #{frame_count}: min={raw_peek.min()}, max={raw_peek.max()}")

                # Convertir a mono int16
                raw = frame.to_ndarray()  # shape (1, N) para s16 interleaved

                if frame.format.name == "s16":
                    flat = raw.flatten().astype(np.float32)
                    if frame.layout.name == "stereo" and len(flat) % 2 == 0:
                        # Stereo interleaved: promediar L+R para mono
                        left = flat[::2]
                        right = flat[1::2]
                        audio_data = ((left + right) / 2).astype(np.int16)
                    else:
                        audio_data = flat.astype(np.int16)
                elif frame.format.name == "s16p":
                    audio_data = raw[0].astype(np.int16)
                elif frame.format.name in ("fltp", "flt"):
                    audio_data = (raw[0].flatten() * 32767).astype(np.int16)
                else:
                    audio_data = raw.flatten().astype(np.int16)

                # Resample a 16kHz
                if frame.rate != SAMPLE_RATE:
                    ratio = SAMPLE_RATE / frame.rate
                    n = int(len(audio_data) * ratio)
                    if n < 2:
                        continue
                    indices = np.arange(n) / ratio
                    idx = np.clip(np.floor(indices).astype(int), 0, len(audio_data) - 2)
                    frac = indices - idx
                    audio_data = (audio_data[idx] * (1 - frac) + audio_data[idx + 1] * frac).astype(np.int16)

                # Acumular samples y correr VAD cuando hay suficiente
                pending_samples = np.concatenate([pending_samples, audio_data])
                frame_size = int(SAMPLE_RATE * FRAME_MS / 1000)

                consumed = 0
                for i in range(0, len(pending_samples) - frame_size + 1, frame_size):
                    chunk = pending_samples[i:i + frame_size]
                    consumed = i + frame_size
                    energy = np.sqrt(np.mean(chunk.astype(np.float32) ** 2))
                    has_speech = energy > ENERGY_THRESHOLD

                    vad_debug += 1
                    if vad_debug % 50 == 0:
                        logger.info(f"VAD: energy={energy:.1f}, threshold={ENERGY_THRESHOLD}, speech={has_speech}, speaking={is_speaking}, buf={len(audio_buffer)}")

                    if has_speech:
                        if tts_track._playing:
                            barge_in_frames += 1
                            if barge_in_frames >= 3:
                                tts_track.stop_playback()
                                barge_in_frames = 0
                        else:
                            barge_in_frames = 0

                        is_speaking = True
                        silence_frames = 0
                        audio_buffer.append(chunk)

                    elif is_speaking:
                        silence_frames += 1
                        audio_buffer.append(chunk)

                        if silence_frames >= frames_for_silence:
                            if len(audio_buffer) > 10:
                                full_audio = np.concatenate(audio_buffer)
                                duration = len(full_audio) / SAMPLE_RATE
                                logger.info(f"Transcribiendo {duration:.1f}s...")

                                user_text = await asyncio.to_thread(transcribe, full_audio)

                                if user_text and not is_hallucination(user_text):
                                    logger.info(f"Usuario: {user_text}")
                                    ch = state.get("chat_dc")
                                    conversation = state["conversation"]

                                    if ch:
                                        try:
                                            ch.send(json.dumps({"type": "final", "text": user_text}))
                                        except Exception:
                                            pass

                                    conversation.append({"role": "user", "content": user_text})

                                    if ch:
                                        try:
                                            ch.send(json.dumps({"type": "thinking"}))
                                        except Exception:
                                            pass

                                    ai_text = await asyncio.to_thread(ask_claude, conversation)
                                    conversation.append({"role": "assistant", "content": ai_text})
                                    logger.info(f"Claude: {ai_text}")

                                    if ch:
                                        try:
                                            ch.send(json.dumps({"type": "response", "text": ai_text}))
                                        except Exception:
                                            pass

                                    tts_audio, tts_sr = await asyncio.to_thread(synthesize, ai_text)
                                    if len(tts_audio) > 0:
                                        tts_track.enqueue_audio(tts_audio, tts_sr)
                                        logger.info(f"TTS encolado: {len(tts_audio)} samples @ {tts_sr}Hz")

                            audio_buffer = []
                            is_speaking = False
                            silence_frames = 0

                # Limpiar samples consumidos
                if consumed > 0:
                    pending_samples = pending_samples[consumed:]

        except Exception as e:
            logger.error(f"Error en audio: {e}\n{traceback.format_exc()}")

    # --- Señalización por WebSocket ---
    remote_description_set = False
    pending_candidates = []

    try:
        while True:
            data = await websocket.receive_json()
            kind = data.get("kind")

            if kind == "webrtc.offer":
                sdp = data["sdp"]
                offer = RTCSessionDescription(sdp=sdp, type="offer")
                await pc.setRemoteDescription(offer)
                remote_description_set = True

                # Aplicar candidates pendientes
                for cand in pending_candidates:
                    try:
                        await pc.addIceCandidate(cand)
                    except Exception:
                        pass
                pending_candidates.clear()

                answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)

                # Esperar ICE gathering (corto timeout)
                for _ in range(30):  # max 3 segundos
                    if pc.iceGatheringState == "complete":
                        break
                    await asyncio.sleep(0.1)

                answer_sdp = pc.localDescription.sdp
                await websocket.send_json({
                    "kind": "webrtc.answer",
                    "sdp": answer_sdp,
                })
                logger.info("Answer enviado")

            elif kind == "webrtc.candidate":
                cand_data = data.get("candidate", {})
                candidate_str = cand_data.get("candidate", "")
                if candidate_str:
                    try:
                        from aiortc.sdp import candidate_from_sdp
                        raw = candidate_str.split(":", 1)[1] if candidate_str.startswith("candidate:") else candidate_str
                        parsed = candidate_from_sdp(raw)
                        parsed.sdpMid = cand_data.get("sdpMid", "0")
                        parsed.sdpMLineIndex = cand_data.get("sdpMLineIndex", 0)

                        if remote_description_set:
                            await pc.addIceCandidate(parsed)
                        else:
                            pending_candidates.append(parsed)
                    except Exception as e:
                        logger.debug(f"ICE candidate skip: {e}")

            elif kind == "ping":
                await websocket.send_json({"kind": "pong", "ts": data.get("ts")})

    except WebSocketDisconnect:
        logger.info("WebSocket desconectado")
    except Exception as e:
        logger.error(f"Signaling error: {e}")
    finally:
        await pc.close()
        pcs.discard(pc)

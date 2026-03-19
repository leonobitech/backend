"""Custom LiveKit TTS plugin wrapping Piper for local inference."""

import asyncio
import logging
from pathlib import Path

from livekit.agents import tts, utils
from livekit.agents.types import APIConnectOptions

logger = logging.getLogger("tts.piper")

DEFAULT_MODEL = Path(__file__).parent / "models" / "es_AR-daniela-high.onnx"

PIPER_SAMPLE_RATE = 22050


class PiperTTS(tts.TTS):
    """TTS plugin using Piper for local speech synthesis."""

    def __init__(
        self,
        *,
        model_path: str | Path = DEFAULT_MODEL,
        length_scale: float = 0.75,
        noise_scale: float = 0.8,
        noise_w: float = 0.6,
    ):
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=PIPER_SAMPLE_RATE,
            num_channels=1,
        )
        self._model_path = str(model_path)
        self._length_scale = length_scale
        self._noise_scale = noise_scale
        self._noise_w = noise_w
        self._voice = None

    def _ensure_model(self):
        if self._voice is None:
            from piper import PiperVoice

            logger.info(f"Cargando Piper: {self._model_path}")
            self._voice = PiperVoice.load(self._model_path)
            logger.info("Piper cargado.")

    def _synthesize_pcm(self, text: str) -> bytes:
        """Synthesize text to raw PCM int16 bytes."""
        import numpy as np
        from piper.voice import SynthesisConfig

        config = SynthesisConfig(
            length_scale=self._length_scale,
            noise_scale=self._noise_scale,
            noise_w_scale=self._noise_w,
        )

        all_audio = []
        for chunk in self._voice.synthesize(text, syn_config=config):
            int16_audio = (chunk.audio_float_array * 32767).astype(np.int16)
            all_audio.append(int16_audio)

        if not all_audio:
            return b""

        audio_data = np.concatenate(all_audio)
        return audio_data.tobytes()

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = APIConnectOptions(),
    ) -> "PiperChunkedStream":
        return PiperChunkedStream(tts=self, input_text=text, conn_options=conn_options)


class PiperChunkedStream(tts.ChunkedStream):
    """Generates Piper audio as a single chunk via AudioEmitter."""

    def __init__(self, *, tts: PiperTTS, input_text: str, conn_options: APIConnectOptions):
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._piper_tts = tts

    async def _run(self, output_emitter: tts.AudioEmitter):
        self._piper_tts._ensure_model()

        # Run synthesis in thread pool
        loop = asyncio.get_event_loop()
        pcm_data = await loop.run_in_executor(
            None, self._piper_tts._synthesize_pcm, self._input_text
        )

        if not pcm_data:
            return

        request_id = utils.shortuuid()

        output_emitter.initialize(
            request_id=request_id,
            sample_rate=PIPER_SAMPLE_RATE,
            num_channels=1,
            mime_type="audio/pcm",
        )

        output_emitter.push(pcm_data)
        output_emitter.flush()

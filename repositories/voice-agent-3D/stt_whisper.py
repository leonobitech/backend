"""Custom LiveKit STT plugin wrapping faster-whisper for local inference."""

import asyncio
import logging

import numpy as np
from livekit.agents import stt, utils
from livekit.agents.types import APIConnectOptions, NOT_GIVEN, NotGivenOr

logger = logging.getLogger("stt.faster-whisper")


class FasterWhisperSTT(stt.STT):
    """STT plugin using faster-whisper for local Whisper inference."""

    def __init__(
        self,
        *,
        model_size: str = "small",
        device: str = "cpu",
        compute_type: str = "int8",
        language: str = "es",
    ):
        super().__init__(
            capabilities=stt.STTCapabilities(streaming=False, interim_results=False),
        )
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._language = language
        self._model = None

    def _ensure_model(self):
        if self._model is None:
            from faster_whisper import WhisperModel

            logger.info(f"Cargando Whisper {self._model_size} ({self._device}, {self._compute_type})")
            self._model = WhisperModel(
                self._model_size,
                device=self._device,
                compute_type=self._compute_type,
            )
            logger.info("Whisper cargado.")

    async def _recognize_impl(
        self,
        buffer: utils.AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = APIConnectOptions(),
    ) -> stt.SpeechEvent:
        self._ensure_model()

        # Merge all frames into a single AudioFrame
        frame = utils.merge_frames(buffer)
        audio_data = np.frombuffer(frame.data, dtype=np.int16).astype(np.float32) / 32768.0

        lang = language if language is not NOT_GIVEN else self._language

        # Run transcription in thread pool (blocking call)
        loop = asyncio.get_event_loop()
        segments, info = await loop.run_in_executor(
            None,
            lambda: self._model.transcribe(
                audio_data,
                language=lang,
                vad_filter=True,
                beam_size=5,
            ),
        )

        # Collect all segment texts
        text = " ".join(seg.text.strip() for seg in segments if seg.text.strip())

        if text:
            logger.info(f"Transcripción: {text}")

        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[stt.SpeechData(language=lang, text=text)],
        )

"""
Custom Pipecat TTS Service for Piper HTTP API.
Calls the Piper TTS server to generate audio from text, sentence by sentence.
"""

import struct
from typing import AsyncGenerator

import aiohttp
from loguru import logger

from pipecat.frames.frames import (
    CancelFrame,
    EndFrame,
    Frame,
    StartFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
)
from pipecat.services.ai_services import TTSService


class PiperHTTPTTSService(TTSService):
    """TTS service that calls a Piper HTTP server.

    Piper generates audio very fast on CPU (~30x real-time).
    The HTTP API returns complete audio per request (non-streaming),
    but Pipecat's text aggregation splits text into sentences,
    so each sentence fires a separate fast Piper call.
    """

    class Settings(TTSService.Settings):
        url: str = "http://127.0.0.1:5000/tts"
        length_scale: float = 1.0
        noise_scale: float = 0.667
        noise_w: float = 0.8
        piper_sample_rate: int = 22050

    def __init__(self, *, settings: "PiperHTTPTTSService.Settings | None" = None, **kwargs):
        super().__init__(sample_rate=settings.piper_sample_rate if settings else 22050, **kwargs)
        self._settings = settings or self.Settings()
        self._session: aiohttp.ClientSession | None = None

    async def start(self, frame: StartFrame):
        await super().start(frame)
        self._session = aiohttp.ClientSession()

    async def stop(self, frame: EndFrame):
        await super().stop(frame)
        if self._session:
            await self._session.close()
            self._session = None

    async def cancel(self, frame: CancelFrame):
        await super().cancel(frame)
        if self._session:
            await self._session.close()
            self._session = None

    async def run_tts(self, text: str) -> AsyncGenerator[Frame, None]:
        """Generate audio from text via Piper HTTP API."""
        if not text.strip():
            return

        if not self._session:
            self._session = aiohttp.ClientSession()

        logger.debug(f"PiperTTS: generating audio for '{text[:50]}...' ({len(text)} chars)")

        yield TTSStartedFrame()

        try:
            async with self._session.post(
                self._settings.url,
                json={
                    "text": text,
                    "output_format": "wav",
                    "length_scale": self._settings.length_scale,
                    "noise_scale": self._settings.noise_scale,
                    "noise_w": self._settings.noise_w,
                },
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    error = await resp.text()
                    logger.error(f"PiperTTS: HTTP {resp.status}: {error}")
                    yield TTSStoppedFrame()
                    return

                wav_data = await resp.read()

                # Strip WAV header (44 bytes) to get raw PCM
                if len(wav_data) > 44 and wav_data[:4] == b"RIFF":
                    pcm_data = wav_data[44:]
                else:
                    pcm_data = wav_data

                if pcm_data:
                    # Send as single audio frame (Piper is fast enough)
                    yield TTSAudioRawFrame(
                        audio=pcm_data,
                        sample_rate=self._settings.piper_sample_rate,
                        num_channels=1,
                    )

        except aiohttp.ClientError as e:
            logger.error(f"PiperTTS: connection error: {e}")
        except Exception as e:
            logger.error(f"PiperTTS: unexpected error: {e}")

        yield TTSStoppedFrame()

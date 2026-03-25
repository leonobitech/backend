"""
Custom Pipecat TTS Service for Piper HTTP API.
Calls the Piper TTS server to generate audio from text.
"""

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
from pipecat.services.tts_service import TTSService


class PiperHTTPTTSService(TTSService):
    """TTS service that calls a Piper HTTP server.

    Piper generates audio very fast on CPU (~30x real-time).
    Each text chunk fires a separate HTTP request to Piper.
    """

    def __init__(
        self,
        *,
        url: str = "http://127.0.0.1:5000/tts",
        length_scale: float = 1.0,
        noise_scale: float = 0.667,
        noise_w: float = 0.8,
        piper_sample_rate: int = 22050,
        **kwargs,
    ):
        super().__init__(sample_rate=piper_sample_rate, **kwargs)
        self._url = url
        self._length_scale = length_scale
        self._noise_scale = noise_scale
        self._noise_w = noise_w
        self._piper_sample_rate = piper_sample_rate
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

        logger.debug(f"PiperTTS: generating '{text[:60]}' ({len(text)} chars)")

        yield TTSStartedFrame()

        try:
            async with self._session.post(
                self._url,
                json={
                    "text": text,
                    "output_format": "wav",
                    "length_scale": self._length_scale,
                    "noise_scale": self._noise_scale,
                    "noise_w": self._noise_w,
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
                    yield TTSAudioRawFrame(
                        audio=pcm_data,
                        sample_rate=self._piper_sample_rate,
                        num_channels=1,
                    )

        except aiohttp.ClientError as e:
            logger.error(f"PiperTTS: connection error: {e}")
        except Exception as e:
            logger.error(f"PiperTTS: unexpected error: {e}")

        yield TTSStoppedFrame()

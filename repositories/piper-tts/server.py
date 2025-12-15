"""
Piper TTS Server - FastAPI
Converts text to speech using Piper with es_AR-daniela-high voice.
"""

import io
import subprocess
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

app = FastAPI(
    title="Piper TTS Server",
    description="Text-to-Speech API using Piper with Spanish (Argentina) voice",
    version="1.0.0",
)

# Configuration
MODEL_PATH = Path("/app/models/es_AR-daniela-high.onnx")
MODEL_CONFIG_PATH = Path("/app/models/es_AR-daniela-high.onnx.json")
PIPER_BIN = "/app/piper/piper"


class TTSRequest(BaseModel):
    """Request body for TTS conversion."""
    text: str = Field(..., min_length=1, max_length=5000, description="Text to convert to speech")
    output_format: Literal["wav", "opus"] = Field(default="wav", description="Output audio format")
    speaker_id: int | None = Field(default=None, description="Speaker ID (if model supports multiple speakers)")
    length_scale: float = Field(default=1.0, ge=0.5, le=2.0, description="Speech speed (1.0 = normal)")
    noise_scale: float = Field(default=0.667, ge=0.0, le=1.0, description="Phoneme noise")
    noise_w: float = Field(default=0.8, ge=0.0, le=1.0, description="Phoneme width noise")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    model_loaded: bool
    model_name: str


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Check if the service is healthy and model is available."""
    model_exists = MODEL_PATH.exists() and MODEL_CONFIG_PATH.exists()
    return HealthResponse(
        status="ok" if model_exists else "degraded",
        model_loaded=model_exists,
        model_name="es_AR-daniela-high",
    )


@app.post("/tts")
async def text_to_speech(request: TTSRequest) -> Response:
    """
    Convert text to speech audio.

    Returns WAV or OGG/Opus audio file.
    """
    # Verify model exists
    if not MODEL_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail="TTS model not loaded. Please ensure es_AR-daniela-high model is downloaded.",
        )

    try:
        # Build piper command
        cmd = [
            PIPER_BIN,
            "--model", str(MODEL_PATH),
            "--config", str(MODEL_CONFIG_PATH),
            "--output-raw",
            "--length-scale", str(request.length_scale),
            "--noise-scale", str(request.noise_scale),
            "--noise-w", str(request.noise_w),
        ]

        if request.speaker_id is not None:
            cmd.extend(["--speaker", str(request.speaker_id)])

        # Run piper with text input
        process = subprocess.run(
            cmd,
            input=request.text.encode("utf-8"),
            capture_output=True,
            timeout=60,
        )

        if process.returncode != 0:
            error_msg = process.stderr.decode("utf-8", errors="replace")
            raise HTTPException(
                status_code=500,
                detail=f"Piper TTS failed: {error_msg}",
            )

        raw_audio = process.stdout

        if not raw_audio:
            raise HTTPException(
                status_code=500,
                detail="Piper produced no audio output",
            )

        # Convert raw PCM to WAV or Opus
        if request.output_format == "wav":
            audio_data = pcm_to_wav(raw_audio)
            media_type = "audio/wav"
            filename = "speech.wav"
        else:
            audio_data = pcm_to_opus(raw_audio)
            media_type = "audio/ogg"
            filename = "speech.ogg"

        return Response(
            content=audio_data,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail="TTS conversion timed out",
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=500,
            detail=f"Internal error: {str(e)}",
        )


def pcm_to_wav(pcm_data: bytes, sample_rate: int = 22050, channels: int = 1, bits_per_sample: int = 16) -> bytes:
    """Convert raw PCM audio to WAV format."""
    import struct

    # WAV header
    byte_rate = sample_rate * channels * bits_per_sample // 8
    block_align = channels * bits_per_sample // 8
    data_size = len(pcm_data)

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,  # Subchunk1Size (PCM)
        1,   # AudioFormat (PCM)
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        data_size,
    )

    return header + pcm_data


def pcm_to_opus(pcm_data: bytes, sample_rate: int = 22050) -> bytes:
    """Convert raw PCM audio to OGG/Opus format optimized for WhatsApp voice messages."""
    with tempfile.NamedTemporaryFile(suffix=".raw", delete=True) as raw_file:
        raw_file.write(pcm_data)
        raw_file.flush()

        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=True) as ogg_file:
            cmd = [
                "ffmpeg", "-y",
                "-f", "s16le",
                "-ar", str(sample_rate),
                "-ac", "1",
                "-i", raw_file.name,
                # WhatsApp-compatible Opus settings
                "-c:a", "libopus",
                "-b:a", "32k",          # 32kbps is good for voice
                "-ar", "48000",         # WhatsApp expects 48kHz
                "-ac", "1",             # Mono
                "-application", "voip", # Optimize for voice
                "-vbr", "on",           # Variable bitrate
                ogg_file.name,
            ]

            result = subprocess.run(cmd, capture_output=True, timeout=30)

            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg failed: {result.stderr.decode()}")

            return Path(ogg_file.name).read_bytes()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)

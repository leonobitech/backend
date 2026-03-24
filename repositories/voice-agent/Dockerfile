FROM python:3.12-slim

WORKDIR /app

# System deps for audio processing
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml ./
COPY bot.py ./

# Install Python deps
RUN pip install --no-cache-dir "."

# Cache dirs for models and NLTK data
ENV HF_HOME=/app/.cache/huggingface
ENV NLTK_DATA=/app/.cache/nltk_data
RUN mkdir -p /app/.cache/huggingface /app/.cache/nltk_data

# Pre-download NLTK tokenizer + Silero VAD model at build time
RUN python -c "\
import nltk; \
nltk.download('punkt_tab', download_dir='/app/.cache/nltk_data'); \
from pipecat.audio.vad.silero import SileroVADAnalyzer; \
SileroVADAnalyzer()"

# Non-root user
RUN useradd -r -u 10010 -d /app agent && \
    chown -R agent:agent /app/.cache

USER agent

EXPOSE 8200

# Pipecat bot entrypoint
ENTRYPOINT ["python", "bot.py"]

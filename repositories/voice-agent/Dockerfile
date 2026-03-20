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
COPY agent.py ./

# Install Python deps (cloud only: Deepgram STT + ElevenLabs TTS)
RUN pip install --no-cache-dir -e ".[cloud]"

# Shared cache dir accessible by all users (including subprocesses)
ENV HF_HOME=/app/.cache/huggingface
RUN mkdir -p /app/.cache/huggingface

# Download models at build time
RUN python agent.py download-files || true

# Non-root user
RUN useradd -r -u 10010 agent && \
    chown -R agent:agent /app/.cache

USER agent

# LiveKit agent entrypoint
ENTRYPOINT ["python", "agent.py", "start"]

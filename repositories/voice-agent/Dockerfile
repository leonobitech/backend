FROM python:3.12-slim

WORKDIR /app

# System deps for audio processing + piper-phonemize
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        libffi-dev \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml ./
COPY agent.py ./
COPY tts_piper.py ./

# Install Python deps (cloud STT + local TTS)
RUN pip install --no-cache-dir -e ".[cloud,local]"

# Download Piper model at build time (medium = faster on CPU)
RUN mkdir -p /app/models && \
    pip install --no-cache-dir huggingface-hub && \
    python -c "from huggingface_hub import hf_hub_download; \
        hf_hub_download('rhasspy/piper-voices', 'es/es_ES/davefx/medium/es_ES-davefx-medium.onnx', local_dir='/app/models', local_dir_use_symlinks=False); \
        hf_hub_download('rhasspy/piper-voices', 'es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json', local_dir='/app/models', local_dir_use_symlinks=False)" && \
    mv /app/models/es/es_ES/davefx/medium/* /app/models/ && \
    rm -rf /app/models/es

# Shared cache dir accessible by all users (including subprocesses)
ENV HF_HOME=/app/.cache/huggingface
RUN mkdir -p /app/.cache/huggingface

# Download LiveKit agent models at build time
RUN python agent.py download-files || true

# Non-root user
RUN useradd -r -u 10010 agent && \
    chown -R agent:agent /app/.cache /app/models

USER agent

# LiveKit agent entrypoint
ENTRYPOINT ["python", "agent.py", "start"]

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

# Install Python deps
RUN pip install --no-cache-dir -e ".[cloud]"

# Download turn detector model at build time
RUN python -c "from livekit.plugins.turn_detector.base import _download_from_hf_hub; _download_from_hf_hub('model_q8.onnx')" || true
RUN python agent.py download-files || true

# Non-root user
RUN useradd -r -u 10010 agent
USER agent

# LiveKit agent entrypoint
ENTRYPOINT ["python", "agent.py", "start"]

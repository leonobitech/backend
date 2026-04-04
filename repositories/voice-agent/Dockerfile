FROM python:3.12-slim

WORKDIR /app

# System deps for audio processing
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        libffi-dev \
        git \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml ./
COPY agent.py ./

# Install Python deps (Gemini Flash Live + Silero VAD)
RUN pip install --no-cache-dir "."

# Non-root user
RUN useradd -r -u 10010 agent

USER agent

# LiveKit agent entrypoint
ENTRYPOINT ["python", "agent.py", "start"]

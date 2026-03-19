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

# Non-root user
RUN useradd -m -r -u 10010 agent

# Download models at build time (as root, then fix permissions)
RUN python agent.py download-files || true
RUN cp -r /root/.cache/huggingface /home/agent/.cache/huggingface 2>/dev/null || true && \
    chown -R agent:agent /home/agent/.cache 2>/dev/null || true

ENV HOME=/home/agent
USER agent

# LiveKit agent entrypoint
ENTRYPOINT ["python", "agent.py", "start"]

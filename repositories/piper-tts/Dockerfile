# Piper TTS Server
# Multi-stage build for minimal image size

FROM python:3.11-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Download Piper binary (CPU-only, amd64)
WORKDIR /piper-download
RUN curl -L -o piper.tar.gz \
    "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz" \
    && tar -xzf piper.tar.gz \
    && rm piper.tar.gz

# Download es_AR-daniela-high model (~114MB)
WORKDIR /models
RUN curl -L -o es_AR-daniela-high.onnx \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx" \
    && curl -L -o es_AR-daniela-high.onnx.json \
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx.json"

# Final stage
FROM python:3.11-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u 10002 -g nogroup piper

WORKDIR /app

# Copy Piper binary and libs
COPY --from=builder /piper-download/piper /app/piper/
RUN chmod +x /app/piper/piper

# Copy models
COPY --from=builder /models/es_AR-daniela-high.onnx /app/models/es_AR-daniela-high.onnx
COPY --from=builder /models/es_AR-daniela-high.onnx.json /app/models/es_AR-daniela-high.onnx.json

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY server.py .

# Set ownership
RUN chown -R piper:nogroup /app

USER piper

EXPOSE 5000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')" || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5000"]

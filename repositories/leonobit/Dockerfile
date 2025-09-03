# --- Build stage (estable) ---
FROM rust:slim-bookworm AS builder
WORKDIR /usr/src/app

# 🔧 Dependencias de build necesarias para whisper.cpp y friends
# (cmake para whisper.cpp, clang/libclang para bindgen, build-essential para toolchain C/C++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    clang \
    libclang-dev \
    pkg-config \
    libssl-dev \
    libopus-dev \
    git \
 && rm -rf /var/lib/apt/lists/*

# 🧱 Caché de deps de Rust (ahora sí, con toolchains ya instaladas)
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs
# Prefetch y build ligera para calentar caché (si falla por no tener código real, ignoramos)
RUN cargo fetch
RUN cargo build --release || true

# 📦 Copiamos el código real y compilamos
COPY src ./src
RUN cargo build --release

# --- Runtime (mínimo y seguro) ---
FROM debian:bookworm-slim
WORKDIR /app

# Certs + utilidades mínimas para healthcheck
# 💡 Añadimos libstdc++6 por si el binario linkea C++ en runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    libstdc++6 \
    libopus0 \
 && rm -rf /var/lib/apt/lists/*

# Copiar binario
COPY --from=builder /usr/src/app/target/release/leonobit /usr/local/bin/leonobit

# Usuario no root (coincide con compose user: "10001:10001")
RUN adduser --uid 10001 --disabled-password --gecos "" appuser \
 && chown -R 10001:10001 /app
USER 10001:10001

# Puerto y logs
ENV PORT=8000
ENV RUST_LOG=info,leonobit=debug,axum=info,webrtc=info,tower_http=info
ENV WHISPER_MODEL_PATH=/app/models/ggml-base.bin

EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/leonobit"]

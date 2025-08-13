# --- Build stage (estable) ---
FROM rust:1.79-bookworm AS builder
WORKDIR /usr/src/app

# Opt: caché de deps
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo 'fn main(){}' > src/main.rs && cargo build --release
# Copia el código real
COPY src ./src

# Dependencias nativas
RUN apt-get update && apt-get install -y --no-install-recommends libssl-dev pkg-config \
 && rm -rf /var/lib/apt/lists/*

# Compilar release
RUN cargo build --release

# --- Runtime (mínimo y seguro) ---
FROM debian:bookworm-slim
WORKDIR /app

# Certs + utilidades mínimas para healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Copiar binario
COPY --from=builder /usr/src/app/target/release/leonobit /usr/local/bin/leonobit

# Usuario no root (coincide con compose user: "10001:10001")
RUN adduser --uid 10001 --disabled-password --gecos "" appuser \
 && chown -R 10001:10001 /app
USER 10001:10001

# Puerto y logs
ENV PORT=8000
ENV RUST_LOG=info,tower_http=info

EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/leonobit"]

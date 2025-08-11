FROM rust:1.81-bookworm AS builder
WORKDIR /usr/src/app

# Copia todo el código
COPY . .

# Dependencias necesarias para compilar crates nativos
RUN apt-get update && apt-get install -y --no-install-recommends libssl-dev pkg-config

# Compilar en modo release
RUN cargo build --release

# --- Runtime Stage ---
FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

# Copiar el binario final
COPY --from=builder /usr/src/app/target/release/leonobit /usr/local/bin/leonobit

EXPOSE 8000
ENV RUST_LOG=info
ENTRYPOINT ["leonobit"]

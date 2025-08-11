# --- Build stage ---
FROM rust:1.81-bookworm AS builder
WORKDIR /app

# Copiamos y compilamos dependencias primero (cache)
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copiamos el código real y compilamos
COPY src ./src
RUN cargo build --release

# --- Runtime stage ---
FROM debian:bookworm-slim
WORKDIR /app

# Instala solo lo necesario para runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/leonobit /app/leonobit

EXPOSE 8000
ENV RUST_LOG=info

ENTRYPOINT ["/app/leonobit"]

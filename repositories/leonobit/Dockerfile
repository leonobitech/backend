# --- builder ---
FROM rust:1.89.0-trixie AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config git ca-certificates && rm -rf /var/lib/apt/lists/*

# cache deps
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo "fn main(){}" > src/main.rs && cargo build --release

# build real
COPY src ./src
RUN cargo build --release && strip target/release/leonobit

# --- runtime ---
FROM debian:trixie-slim
WORKDIR /app
ENV RUST_LOG=info
RUN useradd -m appuser && apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
USER appuser
COPY --from=builder /app/target/release/leonobit /app/leonobit
EXPOSE 8000
ENTRYPOINT ["/app/leonobit"]

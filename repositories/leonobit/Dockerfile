# --- build (Debian Trixie, robusto) ---
FROM rust:1.89.0-trixie AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config git ca-certificates && rm -rf /var/lib/apt/lists/*

# cache deps
#COPY Cargo.toml Cargo.lock ./
COPY Cargo.toml ./
RUN mkdir -p src && echo "fn main(){}" > src/main.rs && cargo build --release

# build real
COPY src ./src
RUN cargo build --release && strip target/release/leonobit

# --- runtime (Debian Trixie slim) ---
FROM debian:trixie-slim
WORKDIR /app
ENV RUST_LOG=info
# usuario no-root
RUN useradd -m -u 10001 appuser && \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*
USER appuser
COPY --from=builder /app/target/release/leonobit /app/leonobit
EXPOSE 8000
ENTRYPOINT ["/app/leonobit"]

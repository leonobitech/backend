# --- build ---
FROM rust:1.89.1-slim-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config git ca-certificates && rm -rf /var/lib/apt/lists/*

# cache deps SIN Cargo.lock
COPY Cargo.toml ./
RUN mkdir -p src && echo "fn main(){}" > src/main.rs && cargo build --release

# build real
COPY src ./src
RUN cargo build --release && strip target/release/leonobit

# --- runtime ---
FROM cgr.dev/chainguard/glibc-dynamic:latest
WORKDIR /app
ENV RUST_LOG=info
COPY --from=builder /app/target/release/leonobit /app/leonobit
EXPOSE 8000
USER 65532:65532
ENTRYPOINT ["/app/leonobit"]

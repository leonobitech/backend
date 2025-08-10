# --- build ---
FROM rust:1.89.1-slim-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo "fn main(){}" > src/main.rs && cargo build --release
COPY src ./src
RUN cargo build --release && strip target/release/agent-ai

# --- runtime (chainguard glibc) ---
FROM cgr.dev/chainguard/glibc-dynamic@sha256:<digest>
WORKDIR /app
ENV RUST_LOG=info
COPY --from=builder /app/target/release/agent-ai /app/agent-ai
EXPOSE 8000
USER 65532:65532
ENTRYPOINT ["/app/agent-ai"]

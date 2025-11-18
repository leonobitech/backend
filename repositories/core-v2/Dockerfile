# Build stage
FROM rust:1.82-slim as builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Cache dependencies
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copy source code
COPY . .

# Build application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 app

# Copy binary from builder
COPY --from=builder /app/target/release/core-v2 /usr/local/bin/core-v2

# Change ownership
RUN chown app:app /usr/local/bin/core-v2

# Switch to non-root user
USER app

# Expose ports
EXPOSE 3000 50051

# Run
CMD ["core-v2"]

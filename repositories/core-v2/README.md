# Core-v2 🦀

Production-grade authentication and business logic microservice built with Rust.

## Architecture

This project follows **Clean Architecture** principles with:

- **Domain Layer**: Pure business logic (entities, value objects, services)
- **Application Layer**: Use cases orchestrating domain + infrastructure
- **Infrastructure Layer**: Database, cache, email, gRPC implementations
- **Presentation Layer**: HTTP/gRPC handlers and middleware

### Key Technologies

- **Axum**: Web framework
- **SQLx**: Compile-time checked SQL queries
- **Redis**: Session cache
- **Tonic**: gRPC server
- **Tracing**: Structured observability

## Getting Started

### Prerequisites

- Rust 1.70+ (`rustup install stable`)
- PostgreSQL 14+
- Redis 7+

### Setup

1. **Clone and navigate**:
   ```bash
   cd backend/repositories/core-v2
   ```

2. **Copy environment variables**:
   ```bash
   cp .env.example .env
   ```

3. **Start dependencies** (PostgreSQL + Redis):
   ```bash
   # Using Docker
   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:16
   docker run -d -p 6379:6379 redis:7-alpine
   ```

4. **Run migrations**:
   ```bash
   sqlx database create
   sqlx migrate run
   ```

5. **Run the server**:
   ```bash
   cargo run
   ```

Server will start on `http://localhost:3000`

### Development

```bash
# Run in watch mode
cargo watch -x run

# Run tests
cargo test

# Run with debug logging
RUST_LOG=debug cargo run
```

## Project Structure

```
src/
├── config/              # Configuration management
├── domain/              # Business logic (pure, no I/O)
│   ├── entities/        # Domain entities (User, Session)
│   ├── value_objects/   # Email, Password, etc.
│   ├── services/        # Domain services
│   └── repositories/    # Repository traits (ports)
├── application/         # Use cases
│   ├── commands/        # Write operations
│   ├── queries/         # Read operations
│   └── dto/             # Data transfer objects
├── infrastructure/      # External I/O implementations
│   ├── database/        # PostgreSQL repositories
│   ├── cache/           # Redis cache
│   └── grpc/            # gRPC server
├── presentation/        # HTTP/gRPC handlers
│   ├── http/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── extractors/
│   └── grpc/
└── observability/       # Tracing & metrics
```

## API Endpoints

### Health Check
```bash
curl http://localhost:3000/health
# Response: "OK"
```

### Authentication (Coming Soon)
- `POST /auth/register` - Create new user
- `POST /auth/login` - Login and get JWT
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Revoke session

## Documentation

- [Architecture Design](docs/ARCHITECTURE.md)
- [ADR 001: SQLx Database Layer](docs/ADR/001-database-layer-sqlx.md)

## Testing

```bash
# Unit tests
cargo test --lib

# Integration tests (requires PostgreSQL)
cargo test --test '*'

# With coverage
cargo tarpaulin --out Html
```

## Deployment

```bash
# Build release binary
cargo build --release

# Binary located at:
./target/release/core-v2

# Docker
docker build -t core-v2 .
docker run -p 3000:3000 core-v2
```

## License

MIT © Felix @ Leonobitech

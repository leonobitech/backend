# Core-v2 Architecture Design Document

**Version:** 1.0.0
**Status:** Design Phase
**Author:** Felix @ Leonobitech
**Last Updated:** 2025-11-18

---

## Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [Architectural Principles](#2-architectural-principles)
3. [Technology Stack](#3-technology-stack)
4. [System Architecture](#4-system-architecture)
5. [Layer Architecture](#5-layer-architecture)
6. [Module Structure](#6-module-structure)
7. [Domain Model (DDD)](#7-domain-model-ddd)
8. [Error Handling Strategy](#8-error-handling-strategy)
9. [Tracing & Observability](#9-tracing--observability)
10. [Testing Strategy](#10-testing-strategy)
11. [Security Design](#11-security-design)
12. [Type Safety & Functional Patterns](#12-type-safety--functional-patterns)
13. [gRPC Contracts](#13-grpc-contracts)
14. [Database Design](#14-database-design)
15. [Performance & Scalability](#15-performance--scalability)
16. [Deployment Strategy](#16-deployment-strategy)

---

## 1. Vision & Goals

### 1.1 Vision

Build a **production-grade authentication and business logic microservice** in Rust that demonstrates:
- Enterprise-level architecture patterns
- Maximum type safety and security
- Excellent observability and maintainability
- Scalability from day one
- Modern Rust idioms and functional programming

### 1.2 Core Goals

✅ **Security First**: Memory-safe, no undefined behavior, secure by default
✅ **Type Safety**: Leverage Rust's type system to prevent bugs at compile-time
✅ **Observability**: Comprehensive tracing, metrics, and structured logging
✅ **Testability**: 80%+ code coverage, fast tests, deterministic
✅ **Maintainability**: Clean architecture, clear boundaries, SOLID principles
✅ **Performance**: <10ms p95 latency for auth operations, 10k+ RPS capability
✅ **Scalability**: Horizontal scaling, stateless design, efficient resource usage

### 1.3 Non-Goals (for now)

❌ GraphQL API (REST + gRPC only)
❌ Multi-tenancy (single tenant for v1)
❌ Advanced RBAC (basic roles only)
❌ Event sourcing (CQRS-lite only)

---

## 2. Architectural Principles

### 2.1 SOLID Principles

- **Single Responsibility**: Each module/struct has one reason to change
- **Open/Closed**: Open for extension (traits), closed for modification
- **Liskov Substitution**: Trait implementations are substitutable
- **Interface Segregation**: Small, focused traits (not monolithic)
- **Dependency Inversion**: Depend on abstractions (traits), not concrete types

### 2.2 Rust-Specific Principles

1. **Zero-Cost Abstractions**: No runtime overhead for safety
2. **Explicit over Implicit**: Make invariants visible in types
3. **Parse, Don't Validate**: Use types to enforce constraints
4. **Make Illegal States Unrepresentable**: Leverage type system
5. **Error Handling via Result<T, E>**: No panics in production code
6. **Immutability by Default**: Prefer immutable data structures
7. **Composition over Inheritance**: Use traits + composition

### 2.3 Functional Programming Principles

- **Pure Functions**: Most business logic is side-effect free
- **Function Composition**: Build complex operations from simple ones
- **Monadic Error Handling**: Chain operations with `?` operator
- **Algebraic Data Types**: Use enums extensively (sum types)
- **Type-Driven Development**: Let types guide implementation

---

## 3. Technology Stack

### 3.1 Core Dependencies

```toml
[dependencies]
# Web Framework & HTTP
axum = { version = "0.7", features = ["macros", "tracing"] }
tower = { version = "0.4", features = ["full"] }
tower-http = { version = "0.5", features = ["trace", "cors", "compression"] }
hyper = { version = "1.0", features = ["full"] }
tokio = { version = "1.40", features = ["full"] }

# Database & Persistence
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "uuid", "chrono", "json"] }
redis = { version = "0.25", features = ["tokio-comp", "connection-manager"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Validation
validator = { version = "0.18", features = ["derive"] }

# Authentication & Security
argon2 = "0.5"
jsonwebtoken = "9.3"
uuid = { version = "1.10", features = ["v4", "serde"] }

# gRPC
tonic = { version = "0.12", features = ["transport", "tls"] }
prost = "0.13"

# Error Handling
thiserror = "1.0"
anyhow = "1.0"

# Tracing & Observability
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
tracing-opentelemetry = "0.24"
opentelemetry = { version = "0.23", features = ["trace"] }
opentelemetry-otlp = "0.16"

# Configuration
config = "0.14"
dotenvy = "0.15"

# Time & Date
chrono = { version = "0.4", features = ["serde"] }

# Async utilities
async-trait = "0.1"
futures = "0.3"

[dev-dependencies]
# Testing
tokio-test = "0.4"
mockall = "0.13"
rstest = "0.21"
wiremock = "0.6"
testcontainers = "0.20"
fake = "2.9"
quickcheck = "1.0"

[build-dependencies]
# gRPC code generation
tonic-build = "0.12"
```

### 3.2 Why These Choices?

| Crate | Why? |
|-------|------|
| **Axum** | Modern, type-safe, built on Tower, excellent ergonomics |
| **SQLx** | Compile-time checked queries, async-native, safe |
| **Tonic** | Production-ready gRPC, interop with Python/Go |
| **thiserror** | Ergonomic custom error types |
| **tracing** | Structured, async-aware logging/tracing |
| **argon2** | Memory-hard password hashing (OWASP recommended) |
| **testcontainers** | Real database testing (no mocks for integration) |

---

## 4. System Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│                    (Next.js + React)                        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      core-v2 (Rust)                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Presentation Layer (Axum)                  │   │
│  │  - REST API handlers                                 │   │
│  │  - Request validation                                │   │
│  │  - Response formatting                               │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐   │
│  │        Application Layer (Use Cases)                 │   │
│  │  - Business workflows                                │   │
│  │  - Transaction boundaries                            │   │
│  │  - Command/Query handlers                            │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐   │
│  │         Domain Layer (Business Logic)                │   │
│  │  - Entities (User, Session, Token)                   │   │
│  │  - Value Objects (Email, Password)                   │   │
│  │  - Domain Services                                   │   │
│  │  - Business Rules                                    │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                     │
│  ┌────────────────────▼─────────────────────────────────┐   │
│  │      Infrastructure Layer (External I/O)             │   │
│  │  - PostgreSQL repository implementations             │   │
│  │  - Redis cache                                       │   │
│  │  - Email service                                     │   │
│  │  - gRPC server                                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                         │ gRPC
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  ai-service (Python/FastAPI)                │
│  - AI features                                              │
│  - ML models                                                │
│  - n8n integrations                                         │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Communication Patterns

- **Frontend ↔ core-v2**: RESTful HTTP (JSON)
- **core-v2 ↔ ai-service**: gRPC (Protocol Buffers)
- **core-v2 ↔ PostgreSQL**: SQL via SQLx
- **core-v2 ↔ Redis**: Redis protocol
- **ai-service ↔ n8n**: Webhooks (HTTP)

---

## 5. Layer Architecture

We use **Hexagonal Architecture** (Ports & Adapters) with **Clean Architecture** principles.

### 5.1 Dependency Rule

```
Presentation → Application → Domain ← Infrastructure
```

**Key Rules:**
1. Dependencies point inward only
2. Domain has ZERO external dependencies
3. Infrastructure depends on Domain (via traits)
4. Application orchestrates Domain + Infrastructure

### 5.2 Layer Responsibilities

#### Domain Layer (Core Business Logic)

```rust
// Pure business logic, no I/O
pub struct User {
    pub id: UserId,
    pub email: Email,
    pub password_hash: PasswordHash,
    pub created_at: DateTime<Utc>,
}

impl User {
    pub fn verify_password(&self, password: &str) -> Result<(), AuthError> {
        // Pure function, no side effects
    }
}
```

**Characteristics:**
- No async
- No database/HTTP/Redis code
- Pure functions
- Domain-driven types

#### Application Layer (Use Cases)

```rust
// Orchestrates domain + infrastructure
pub struct LoginUseCase<R: UserRepository> {
    user_repo: R,
    token_service: Arc<TokenService>,
}

impl<R: UserRepository> LoginUseCase<R> {
    #[tracing::instrument(skip(self, password))]
    pub async fn execute(
        &self,
        email: Email,
        password: String,
    ) -> Result<LoginResponse, AppError> {
        // 1. Fetch user (via port/trait)
        // 2. Verify password (domain logic)
        // 3. Generate token (domain service)
        // 4. Save session (via port/trait)
        // 5. Return response
    }
}
```

**Characteristics:**
- Async (orchestrates I/O)
- Depends on traits (ports), not concrete types
- Transaction boundaries
- Clear input/output

#### Infrastructure Layer (Adapters)

```rust
pub struct PostgresUserRepository {
    pool: PgPool,
}

#[async_trait]
impl UserRepository for PostgresUserRepository {
    async fn find_by_email(&self, email: &Email) -> Result<Option<User>, RepoError> {
        sqlx::query_as!(
            UserRow,
            "SELECT * FROM users WHERE email = $1",
            email.as_str()
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| RepoError::Database(e.into()))
        .map(|opt| opt.map(User::from))
    }
}
```

**Characteristics:**
- Implements domain traits
- Handles external I/O
- Error conversion
- Async operations

#### Presentation Layer (HTTP Handlers)

```rust
#[axum::debug_handler]
pub async fn login(
    State(use_case): State<Arc<LoginUseCase<PostgresUserRepository>>>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, ApiError> {
    let email = Email::parse(&req.email)
        .map_err(|_| ApiError::InvalidEmail)?;

    let response = use_case.execute(email, req.password).await?;

    Ok(Json(response))
}
```

**Characteristics:**
- HTTP-specific (Axum extractors)
- Validation
- Serialization/deserialization
- Error formatting

---

## 6. Module Structure

### 6.1 Project Layout

```
core-v2/
├── Cargo.toml
├── build.rs                  # gRPC proto compilation
├── .env.example
├── README.md
│
├── docs/
│   ├── ARCHITECTURE.md       # This file
│   ├── ADR/                  # Architecture Decision Records
│   └── API.md                # API documentation
│
├── proto/                    # gRPC protocol definitions
│   └── auth.proto
│
├── migrations/               # SQLx migrations
│   ├── 20250118_create_users.sql
│   └── 20250118_create_sessions.sql
│
├── src/
│   ├── main.rs               # Application entry point
│   ├── lib.rs                # Library root
│   │
│   ├── config/               # Configuration management
│   │   ├── mod.rs
│   │   └── settings.rs
│   │
│   ├── domain/               # ⭐ Domain layer (pure business logic)
│   │   ├── mod.rs
│   │   ├── entities/
│   │   │   ├── mod.rs
│   │   │   ├── user.rs
│   │   │   ├── session.rs
│   │   │   └── token.rs
│   │   ├── value_objects/
│   │   │   ├── mod.rs
│   │   │   ├── email.rs
│   │   │   ├── password.rs
│   │   │   └── user_id.rs
│   │   ├── services/
│   │   │   ├── mod.rs
│   │   │   ├── token_service.rs
│   │   │   └── password_service.rs
│   │   ├── repositories/     # Traits (ports)
│   │   │   ├── mod.rs
│   │   │   ├── user_repository.rs
│   │   │   └── session_repository.rs
│   │   └── errors.rs
│   │
│   ├── application/          # ⭐ Application layer (use cases)
│   │   ├── mod.rs
│   │   ├── commands/         # Write operations
│   │   │   ├── mod.rs
│   │   │   ├── register_user.rs
│   │   │   ├── login.rs
│   │   │   └── logout.rs
│   │   ├── queries/          # Read operations
│   │   │   ├── mod.rs
│   │   │   ├── get_user.rs
│   │   │   └── list_sessions.rs
│   │   ├── dto/              # Data Transfer Objects
│   │   │   ├── mod.rs
│   │   │   ├── login_request.rs
│   │   │   └── login_response.rs
│   │   └── errors.rs
│   │
│   ├── infrastructure/       # ⭐ Infrastructure layer (adapters)
│   │   ├── mod.rs
│   │   ├── database/
│   │   │   ├── mod.rs
│   │   │   ├── postgres/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── user_repository.rs
│   │   │   │   └── session_repository.rs
│   │   │   └── migrations.rs
│   │   ├── cache/
│   │   │   ├── mod.rs
│   │   │   └── redis_cache.rs
│   │   ├── email/
│   │   │   ├── mod.rs
│   │   │   └── resend_service.rs
│   │   └── grpc/
│   │       ├── mod.rs
│   │       └── server.rs
│   │
│   ├── presentation/         # ⭐ Presentation layer (HTTP/gRPC)
│   │   ├── mod.rs
│   │   ├── http/
│   │   │   ├── mod.rs
│   │   │   ├── routes/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── auth.rs
│   │   │   │   └── users.rs
│   │   │   ├── middleware/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── auth.rs
│   │   │   │   └── tracing.rs
│   │   │   └── extractors/
│   │   │       ├── mod.rs
│   │   │       └── jwt.rs
│   │   └── grpc/
│   │       ├── mod.rs
│   │       └── handlers.rs
│   │
│   ├── observability/        # Tracing & metrics
│   │   ├── mod.rs
│   │   ├── tracing.rs
│   │   └── metrics.rs
│   │
│   └── utils/                # Shared utilities
│       ├── mod.rs
│       └── time.rs
│
└── tests/
    ├── integration/          # Integration tests
    │   ├── mod.rs
    │   ├── auth_flow.rs
    │   └── helpers/
    │       ├── mod.rs
    │       └── test_app.rs
    └── e2e/                  # End-to-end tests
        └── mod.rs
```

### 6.2 Module Dependencies Graph

```
┌─────────────────────────────────────────────────────────────┐
│                       presentation                          │
│                 (HTTP handlers, gRPC)                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       application                           │
│                    (Use cases, DTOs)                        │
└──────────────┬───────────────────────────┬──────────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────────┐   ┌──────────────────────────────┐
│         domain           │   │      infrastructure          │
│  (Entities, Services,    │   │  (DB, Cache, Email, gRPC)    │
│   Value Objects)         │◄──│                              │
└──────────────────────────┘   └──────────────────────────────┘
```

**Key Points:**
- `domain` is independent (no dependencies on other layers)
- `infrastructure` implements traits defined in `domain`
- `application` coordinates `domain` + `infrastructure`
- `presentation` depends on `application`

---

## 7. Domain Model (DDD)

### 7.1 Entities

Entities have **identity** and **lifecycle**.

#### User Entity

```rust
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, PartialEq)]
pub struct User {
    id: UserId,
    email: Email,
    password_hash: PasswordHash,
    full_name: String,
    is_verified: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl User {
    /// Create a new user (factory method)
    pub fn new(
        email: Email,
        password: Password,
    ) -> Result<Self, DomainError> {
        let password_hash = PasswordHash::from_password(&password)?;

        Ok(Self {
            id: UserId::new(),
            email,
            password_hash,
            full_name: String::new(),
            is_verified: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        })
    }

    /// Verify password (domain logic)
    pub fn verify_password(&self, password: &str) -> Result<(), DomainError> {
        self.password_hash.verify(password)
    }

    /// Getters (expose immutable references)
    pub fn id(&self) -> &UserId { &self.id }
    pub fn email(&self) -> &Email { &self.email }
    pub fn is_verified(&self) -> bool { self.is_verified }

    /// Mark email as verified (state transition)
    pub fn mark_as_verified(&mut self) {
        self.is_verified = true;
        self.updated_at = Utc::now();
    }
}
```

#### Session Entity

```rust
#[derive(Debug, Clone)]
pub struct Session {
    id: SessionId,
    user_id: UserId,
    device_info: DeviceInfo,
    ip_address: IpAddress,
    expires_at: DateTime<Utc>,
    created_at: DateTime<Utc>,
}

impl Session {
    pub fn new(
        user_id: UserId,
        device_info: DeviceInfo,
        ip_address: IpAddress,
        ttl: Duration,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: SessionId::new(),
            user_id,
            device_info,
            ip_address,
            expires_at: now + ttl,
            created_at: now,
        }
    }

    pub fn is_expired(&self) -> bool {
        Utc::now() > self.expires_at
    }

    pub fn id(&self) -> &SessionId { &self.id }
    pub fn user_id(&self) -> &UserId { &self.user_id }
}
```

### 7.2 Value Objects

Value objects have **no identity**, only values. They are **immutable**.

#### Email Value Object

```rust
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Email(String);

impl Email {
    /// Parse and validate email
    pub fn parse(s: &str) -> Result<Self, EmailError> {
        if s.is_empty() {
            return Err(EmailError::Empty);
        }

        if !s.contains('@') {
            return Err(EmailError::InvalidFormat);
        }

        // More validation (use regex or email-address crate)
        Ok(Self(s.to_lowercase()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Email {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

// Parse, don't validate pattern
impl std::str::FromStr for Email {
    type Err = EmailError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse(s)
    }
}
```

#### Password & PasswordHash

```rust
/// Plaintext password (never stored)
#[derive(Clone)]
pub struct Password(String);

impl Password {
    pub fn new(s: String) -> Result<Self, PasswordError> {
        if s.len() < 8 {
            return Err(PasswordError::TooShort);
        }
        Ok(Self(s))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

// Prevent accidental logging
impl fmt::Debug for Password {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Password([REDACTED])")
    }
}

/// Hashed password (stored in DB)
#[derive(Debug, Clone)]
pub struct PasswordHash(String);

impl PasswordHash {
    pub fn from_password(password: &Password) -> Result<Self, DomainError> {
        use argon2::{Argon2, PasswordHasher};
        use argon2::password_hash::{SaltString, rand_core::OsRng};

        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();

        let hash = argon2
            .hash_password(password.as_str().as_bytes(), &salt)
            .map_err(|_| DomainError::PasswordHashFailed)?
            .to_string();

        Ok(Self(hash))
    }

    pub fn verify(&self, password: &str) -> Result<(), DomainError> {
        use argon2::{Argon2, PasswordVerifier};
        use argon2::password_hash::PasswordHash;

        let parsed_hash = PasswordHash::new(&self.0)
            .map_err(|_| DomainError::InvalidPasswordHash)?;

        Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .map_err(|_| DomainError::InvalidPassword)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}
```

#### Strong IDs (Type-State Pattern)

```rust
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct UserId(Uuid);

impl UserId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }

    pub fn as_uuid(&self) -> &Uuid {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct SessionId(Uuid);

impl SessionId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

// Cannot accidentally mix UserId and SessionId!
```

### 7.3 Domain Services

When logic doesn't naturally belong to an entity.

```rust
pub struct TokenService {
    signing_key: Vec<u8>,
    issuer: String,
}

impl TokenService {
    pub fn new(signing_key: Vec<u8>, issuer: String) -> Self {
        Self { signing_key, issuer }
    }

    pub fn generate_access_token(
        &self,
        user_id: &UserId,
        session_id: &SessionId,
    ) -> Result<AccessToken, DomainError> {
        use jsonwebtoken::{encode, Header, EncodingKey};

        let claims = Claims {
            sub: user_id.to_string(),
            sid: session_id.to_string(),
            iss: self.issuer.clone(),
            exp: (Utc::now() + Duration::hours(1)).timestamp() as usize,
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(&self.signing_key),
        )
        .map_err(|_| DomainError::TokenGenerationFailed)?;

        Ok(AccessToken::new(token))
    }

    pub fn verify_token(&self, token: &str) -> Result<Claims, DomainError> {
        // JWT verification logic
        todo!()
    }
}
```

### 7.4 Repository Traits (Ports)

Defined in domain, implemented in infrastructure.

```rust
use async_trait::async_trait;

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn save(&self, user: &User) -> Result<(), RepoError>;
    async fn find_by_id(&self, id: &UserId) -> Result<Option<User>, RepoError>;
    async fn find_by_email(&self, email: &Email) -> Result<Option<User>, RepoError>;
    async fn delete(&self, id: &UserId) -> Result<(), RepoError>;
}

#[async_trait]
pub trait SessionRepository: Send + Sync {
    async fn save(&self, session: &Session) -> Result<(), RepoError>;
    async fn find_by_id(&self, id: &SessionId) -> Result<Option<Session>, RepoError>;
    async fn find_by_user_id(&self, user_id: &UserId) -> Result<Vec<Session>, RepoError>;
    async fn delete(&self, id: &SessionId) -> Result<(), RepoError>;
}
```

---

## 8. Error Handling Strategy

### 8.1 Error Hierarchy

We use **typed errors** at each layer:

```
DomainError (domain logic errors)
    ↓
AppError (application/use case errors)
    ↓
ApiError (HTTP presentation errors)
```

### 8.2 Domain Errors

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DomainError {
    #[error("Invalid email format")]
    InvalidEmail,

    #[error("Password too short (minimum 8 characters)")]
    PasswordTooShort,

    #[error("Invalid password")]
    InvalidPassword,

    #[error("Password hashing failed")]
    PasswordHashFailed,

    #[error("Token generation failed")]
    TokenGenerationFailed,

    #[error("Session expired")]
    SessionExpired,

    #[error("User not verified")]
    UserNotVerified,
}
```

### 8.3 Application Errors

```rust
#[derive(Debug, Error)]
pub enum AppError {
    #[error("User not found")]
    UserNotFound,

    #[error("Email already exists")]
    EmailAlreadyExists,

    #[error("Authentication failed")]
    AuthenticationFailed,

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Domain error: {0}")]
    Domain(#[from] DomainError),

    #[error("Repository error: {0}")]
    Repository(#[from] RepoError),

    #[error("Internal error")]
    Internal(#[from] anyhow::Error),
}
```

### 8.4 API Errors (HTTP)

```rust
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Not found")]
    NotFound,

    #[error("Internal server error")]
    Internal,
}

// Convert AppError → ApiError
impl From<AppError> for ApiError {
    fn from(err: AppError) -> Self {
        match err {
            AppError::UserNotFound => ApiError::NotFound,
            AppError::AuthenticationFailed => ApiError::Unauthorized,
            AppError::Unauthorized => ApiError::Unauthorized,
            AppError::Domain(e) => ApiError::BadRequest(e.to_string()),
            _ => ApiError::Internal,
        }
    }
}

// Implement IntoResponse for Axum
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized".to_string()),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "Not found".to_string()),
            ApiError::Internal => {
                tracing::error!("Internal error: {:?}", self);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let body = Json(serde_json::json!({
            "error": error_message,
        }));

        (status, body).into_response()
    }
}
```

### 8.5 Error Handling Patterns

#### Use Result<T, E> Everywhere

```rust
// ❌ BAD - panics in production
pub fn parse_email(s: &str) -> Email {
    Email::parse(s).unwrap()  // NEVER DO THIS
}

// ✅ GOOD - returns Result
pub fn parse_email(s: &str) -> Result<Email, EmailError> {
    Email::parse(s)
}
```

#### Chain with ? Operator

```rust
pub async fn login(
    &self,
    email: String,
    password: String,
) -> Result<LoginResponse, AppError> {
    let email = Email::parse(&email)?;  // Auto-converts via From trait
    let user = self.user_repo
        .find_by_email(&email)
        .await?
        .ok_or(AppError::UserNotFound)?;

    user.verify_password(&password)?;

    let session = Session::new(/* ... */);
    self.session_repo.save(&session).await?;

    Ok(LoginResponse { /* ... */ })
}
```

#### Custom Error Context

```rust
use anyhow::Context;

async fn fetch_user(id: UserId) -> Result<User, AppError> {
    self.repo
        .find_by_id(&id)
        .await
        .context("Failed to fetch user from database")?
        .ok_or(AppError::UserNotFound)
}
```

---

## 9. Tracing & Observability

### 9.1 Philosophy

**Tracing > Logging**

- Use structured tracing (not `println!` or `log::info!`)
- Correlate events with trace IDs
- Export to OpenTelemetry for production

### 9.2 Setup

```rust
use tracing::{info, warn, error, instrument};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init_tracing() {
    tracing_subscriber::registry()
        .with(EnvFilter::from_default_env())
        .with(tracing_subscriber::fmt::layer().json())
        .init();
}
```

### 9.3 Instrument Functions

```rust
#[tracing::instrument(
    name = "login_user",
    skip(self, password),  // Don't log sensitive data
    fields(
        email = %email,
        user_id = tracing::field::Empty,  // Filled later
    )
)]
pub async fn login(
    &self,
    email: Email,
    password: String,
) -> Result<LoginResponse, AppError> {
    info!("Attempting login");

    let user = self.user_repo
        .find_by_email(&email)
        .await?
        .ok_or(AppError::UserNotFound)?;

    // Record user_id after fetching
    tracing::Span::current().record("user_id", &user.id().to_string());

    user.verify_password(&password)
        .map_err(|_| {
            warn!("Invalid password attempt");
            AppError::AuthenticationFailed
        })?;

    info!("Login successful");

    // Generate token...
    Ok(LoginResponse { /* ... */ })
}
```

### 9.4 Trace Levels

| Level | Usage |
|-------|-------|
| `error!` | Unrecoverable errors, system failures |
| `warn!` | Recoverable errors, degraded performance |
| `info!` | Significant business events (login, signup) |
| `debug!` | Detailed flow information |
| `trace!` | Very verbose (loop iterations, etc.) |

### 9.5 Middleware Tracing

```rust
use tower_http::trace::TraceLayer;

let app = Router::new()
    .route("/login", post(login))
    .layer(
        TraceLayer::new_for_http()
            .make_span_with(|request: &Request<_>| {
                tracing::info_span!(
                    "http_request",
                    method = %request.method(),
                    uri = %request.uri(),
                    trace_id = %Uuid::new_v4(),
                )
            })
    );
```

### 9.6 Production: OpenTelemetry Export

```rust
use opentelemetry::global;
use opentelemetry_otlp::WithExportConfig;
use tracing_opentelemetry::OpenTelemetryLayer;

pub fn init_telemetry() -> Result<(), Box<dyn std::error::Error>> {
    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(
            opentelemetry_otlp::new_exporter()
                .tonic()
                .with_endpoint("http://localhost:4317"),
        )
        .install_batch(opentelemetry_sdk::runtime::Tokio)?;

    tracing_subscriber::registry()
        .with(OpenTelemetryLayer::new(tracer))
        .init();

    Ok(())
}
```

---

## 10. Testing Strategy

### 10.1 Testing Pyramid

```
           /\
          /  \  E2E (few, slow, real system)
         /----\
        / Intg \  Integration (moderate, testcontainers)
       /--------\
      /   Unit   \  Unit (many, fast, pure functions)
     /------------\
```

**Target Coverage:**
- Unit: 80%+
- Integration: 60%+
- E2E: Critical paths only

### 10.2 Unit Tests (Domain Logic)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_parsing_valid() {
        let email = Email::parse("test@example.com").unwrap();
        assert_eq!(email.as_str(), "test@example.com");
    }

    #[test]
    fn email_parsing_invalid() {
        let result = Email::parse("invalid");
        assert!(result.is_err());
    }

    #[test]
    fn password_too_short() {
        let result = Password::new("short".to_string());
        assert!(matches!(result, Err(PasswordError::TooShort)));
    }

    #[test]
    fn user_verify_password_success() {
        let password = Password::new("password123".to_string()).unwrap();
        let user = User::new(
            Email::parse("test@example.com").unwrap(),
            password.clone(),
        ).unwrap();

        assert!(user.verify_password(password.as_str()).is_ok());
    }

    #[test]
    fn user_verify_password_failure() {
        let password = Password::new("password123".to_string()).unwrap();
        let user = User::new(
            Email::parse("test@example.com").unwrap(),
            password,
        ).unwrap();

        assert!(user.verify_password("wrong").is_err());
    }
}
```

### 10.3 Integration Tests (with Testcontainers)

```rust
use testcontainers::{clients, images};
use sqlx::PgPool;

#[tokio::test]
async fn test_user_repository_save_and_find() {
    // Start real PostgreSQL in Docker
    let docker = clients::Cli::default();
    let postgres = docker.run(images::postgres::Postgres::default());

    let connection_string = format!(
        "postgres://postgres:postgres@127.0.0.1:{}/postgres",
        postgres.get_host_port_ipv4(5432)
    );

    let pool = PgPool::connect(&connection_string).await.unwrap();

    // Run migrations
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    // Create repository
    let repo = PostgresUserRepository::new(pool);

    // Test save
    let email = Email::parse("test@example.com").unwrap();
    let password = Password::new("password123".to_string()).unwrap();
    let user = User::new(email.clone(), password).unwrap();

    repo.save(&user).await.unwrap();

    // Test find
    let found = repo.find_by_email(&email).await.unwrap();
    assert!(found.is_some());
    assert_eq!(found.unwrap().email(), &email);
}
```

### 10.4 Mocking with mockall

```rust
use mockall::predicate::*;
use mockall::mock;

mock! {
    pub UserRepo {}

    #[async_trait]
    impl UserRepository for UserRepo {
        async fn save(&self, user: &User) -> Result<(), RepoError>;
        async fn find_by_id(&self, id: &UserId) -> Result<Option<User>, RepoError>;
        async fn find_by_email(&self, email: &Email) -> Result<Option<User>, RepoError>;
    }
}

#[tokio::test]
async fn test_login_use_case_user_not_found() {
    let mut mock_repo = MockUserRepo::new();

    mock_repo
        .expect_find_by_email()
        .returning(|_| Ok(None));

    let use_case = LoginUseCase::new(Arc::new(mock_repo), /* ... */);

    let result = use_case.execute(
        Email::parse("test@example.com").unwrap(),
        "password".to_string(),
    ).await;

    assert!(matches!(result, Err(AppError::UserNotFound)));
}
```

### 10.5 Property-Based Testing

```rust
use quickcheck::{quickcheck, Arbitrary, Gen};

impl Arbitrary for Email {
    fn arbitrary(g: &mut Gen) -> Self {
        let name: String = Arbitrary::arbitrary(g);
        let domain: String = Arbitrary::arbitrary(g);
        Email::parse(&format!("{}@{}.com", name, domain))
            .unwrap_or_else(|_| Email::parse("test@example.com").unwrap())
    }
}

#[test]
fn email_round_trip() {
    fn prop(email: Email) -> bool {
        let s = email.as_str();
        Email::parse(s).unwrap() == email
    }

    quickcheck(prop as fn(Email) -> bool);
}
```

---

## 11. Security Design

### 11.1 Security Principles

1. **Defense in Depth**: Multiple layers of security
2. **Least Privilege**: Minimal permissions by default
3. **Secure by Default**: Safe defaults, opt-in for dangerous operations
4. **Fail Securely**: Errors don't leak sensitive info
5. **Don't Trust Input**: Validate everything

### 11.2 Password Security

- **Argon2id** for hashing (memory-hard, OWASP recommended)
- **Unique salt per password** (automatic with Argon2)
- **Constant-time comparison** (built into Argon2)
- **Never log plaintext passwords** (custom Debug impl)

```rust
impl fmt::Debug for Password {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Password([REDACTED])")
    }
}
```

### 11.3 JWT Security

- **Short-lived access tokens** (15 min)
- **Refresh tokens** stored in database
- **Token rotation** on refresh
- **Signature verification** with RS256 (asymmetric)
- **Claims validation**: exp, iss, aud

### 11.4 Session Security

- **Secure cookies**: HttpOnly, Secure, SameSite=Strict
- **Session timeout**: Absolute (24h) + idle (30min)
- **Session binding**: IP + User-Agent fingerprinting
- **Revocation**: Store in Redis with TTL

### 11.5 SQL Injection Prevention

- **Compile-time checked queries** with SQLx
- **Never concatenate SQL strings**

```rust
// ✅ SAFE - compile-time checked
sqlx::query_as!(
    UserRow,
    "SELECT * FROM users WHERE email = $1",
    email.as_str()
)
.fetch_one(&pool)
.await?;

// ❌ DANGEROUS - never do this
let query = format!("SELECT * FROM users WHERE email = '{}'", email);
```

### 11.6 Rate Limiting

```rust
use tower_governor::{GovernorLayer, GovernorConfigBuilder};

let governor_conf = GovernorConfigBuilder::default()
    .per_second(2)
    .burst_size(5)
    .finish()
    .unwrap();

let app = Router::new()
    .route("/login", post(login))
    .layer(GovernorLayer {
        config: Arc::new(governor_conf),
    });
```

### 11.7 CORS Configuration

```rust
use tower_http::cors::{CorsLayer, Any};

let cors = CorsLayer::new()
    .allow_origin("https://leonobitech.com".parse::<HeaderValue>().unwrap())
    .allow_methods([Method::GET, Method::POST])
    .allow_headers([AUTHORIZATION, CONTENT_TYPE])
    .allow_credentials(true);

let app = Router::new()
    .route("/login", post(login))
    .layer(cors);
```

---

## 12. Type Safety & Functional Patterns

### 12.1 Parse, Don't Validate

```rust
// ❌ BAD - validate and hope
fn login(email: String, password: String) -> Result<Token, Error> {
    if !is_valid_email(&email) {
        return Err(Error::InvalidEmail);
    }
    // ... but 'email' is still a String, could be invalid later
}

// ✅ GOOD - parse into type
fn login(email: Email, password: Password) -> Result<Token, Error> {
    // If we have an Email, it's guaranteed to be valid
}
```

### 12.2 Make Illegal States Unrepresentable

```rust
// ❌ BAD - can have inconsistent state
struct User {
    email: String,
    email_verified: bool,
    email_verified_at: Option<DateTime<Utc>>,
}
// What if email_verified = true but email_verified_at = None?

// ✅ GOOD - use enum
enum EmailVerificationStatus {
    Unverified,
    Verified { verified_at: DateTime<Utc> },
}

struct User {
    email: Email,
    verification_status: EmailVerificationStatus,
}
```

### 12.3 Phantom Types (Type-State Pattern)

```rust
struct Token<State> {
    value: String,
    _state: PhantomData<State>,
}

struct Unverified;
struct Verified;

impl Token<Unverified> {
    pub fn new(value: String) -> Self {
        Self {
            value,
            _state: PhantomData,
        }
    }

    pub fn verify(self, secret: &[u8]) -> Result<Token<Verified>, Error> {
        // Verify JWT signature
        jwt::verify(&self.value, secret)?;

        Ok(Token {
            value: self.value,
            _state: PhantomData,
        })
    }
}

impl Token<Verified> {
    pub fn claims(&self) -> Claims {
        // Only verified tokens can extract claims
        jwt::decode(&self.value).unwrap()
    }
}

// Usage
let unverified = Token::<Unverified>::new(token_string);
let verified = unverified.verify(&secret)?;
let claims = verified.claims();  // ✅ Safe, token is verified

// unverified.claims();  // ❌ Compile error!
```

### 12.4 Newtypes for Type Safety

```rust
// ❌ BAD - easy to mix up
fn transfer(from: Uuid, to: Uuid, amount: f64) { }

// ✅ GOOD - impossible to mix up
fn transfer(from: UserId, to: UserId, amount: Money) { }
```

### 12.5 Functional Combinators

```rust
// Chain operations with map, and_then, etc.
let result = parse_email(&input)
    .and_then(|email| find_user(email))
    .and_then(|user| verify_password(user, &password))
    .map(|user| generate_token(user))?;
```

### 12.6 Functional Core, Imperative Shell

```rust
// ✅ Pure function (functional core)
fn calculate_token_expiry(issued_at: DateTime<Utc>, ttl: Duration) -> DateTime<Utc> {
    issued_at + ttl
}

// Imperative shell (orchestrates I/O)
async fn login(/* ... */) -> Result<Token, Error> {
    let user = fetch_user().await?;  // I/O
    let expires_at = calculate_token_expiry(Utc::now(), Duration::hours(1));  // Pure
    let token = generate_token(user, expires_at);  // Pure
    save_session(token).await?;  // I/O
    Ok(token)
}
```

---

## 13. gRPC Contracts

### 13.1 Protocol Buffers Definition

**`proto/auth.proto`:**

```protobuf
syntax = "proto3";

package auth.v1;

service AuthService {
  rpc ValidateToken(ValidateTokenRequest) returns (ValidateTokenResponse);
  rpc RefreshToken(RefreshTokenRequest) returns (RefreshTokenResponse);
  rpc RevokeSession(RevokeSessionRequest) returns (RevokeSessionResponse);
  rpc GetUserInfo(GetUserInfoRequest) returns (GetUserInfoResponse);
}

message ValidateTokenRequest {
  string access_token = 1;
}

message ValidateTokenResponse {
  bool valid = 1;
  string user_id = 2;
  string email = 3;
  repeated string roles = 4;
}

message RefreshTokenRequest {
  string refresh_token = 1;
}

message RefreshTokenResponse {
  string access_token = 1;
  string refresh_token = 2;
  int64 expires_at = 3;
}

message RevokeSessionRequest {
  string session_id = 1;
}

message RevokeSessionResponse {
  bool success = 1;
}

message GetUserInfoRequest {
  string user_id = 1;
}

message GetUserInfoResponse {
  string user_id = 1;
  string email = 2;
  string full_name = 3;
  bool is_verified = 4;
}
```

### 13.2 Build Script

**`build.rs`:**

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .build_server(true)
        .build_client(false)  // Only server side
        .compile(&["proto/auth.proto"], &["proto"])?;
    Ok(())
}
```

### 13.3 gRPC Server Implementation

```rust
use tonic::{Request, Response, Status};
use crate::proto::auth::v1::{
    auth_service_server::{AuthService, AuthServiceServer},
    ValidateTokenRequest, ValidateTokenResponse,
};

pub struct AuthServiceImpl {
    token_service: Arc<TokenService>,
}

#[tonic::async_trait]
impl AuthService for AuthServiceImpl {
    #[tracing::instrument(skip(self, request))]
    async fn validate_token(
        &self,
        request: Request<ValidateTokenRequest>,
    ) -> Result<Response<ValidateTokenResponse>, Status> {
        let req = request.into_inner();

        let claims = self.token_service
            .verify_token(&req.access_token)
            .map_err(|_| Status::unauthenticated("Invalid token"))?;

        let response = ValidateTokenResponse {
            valid: true,
            user_id: claims.sub,
            email: claims.email,
            roles: claims.roles,
        };

        Ok(Response::new(response))
    }
}
```

### 13.4 Integration with Axum

```rust
use axum::Router;
use tonic::transport::Server as TonicServer;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // HTTP server (Axum)
    let http_app = Router::new()
        .route("/login", post(login));

    // gRPC server (Tonic)
    let grpc_service = AuthServiceServer::new(AuthServiceImpl { /* ... */ });

    // Run both servers concurrently
    tokio::select! {
        result = axum::Server::bind(&"0.0.0.0:3000".parse()?)
            .serve(http_app.into_make_service()) => {
            result?;
        }
        result = TonicServer::builder()
            .add_service(grpc_service)
            .serve("0.0.0.0:50051".parse()?) => {
            result?;
        }
    }

    Ok(())
}
```

---

## 14. Database Design

### 14.1 Schema

**`migrations/20250118_create_users.sql`:**

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255) NOT NULL DEFAULT '',
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);
```

**`migrations/20250118_create_sessions.sql`:**

```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_info TEXT,
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

### 14.2 SQLx Query Example

```rust
use sqlx::PgPool;

pub struct PostgresUserRepository {
    pool: PgPool,
}

impl PostgresUserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserRepository for PostgresUserRepository {
    #[tracing::instrument(skip(self, user))]
    async fn save(&self, user: &User) -> Result<(), RepoError> {
        sqlx::query!(
            r#"
            INSERT INTO users (id, email, password_hash, full_name, is_verified, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                password_hash = EXCLUDED.password_hash,
                full_name = EXCLUDED.full_name,
                is_verified = EXCLUDED.is_verified,
                updated_at = EXCLUDED.updated_at
            "#,
            user.id().as_uuid(),
            user.email().as_str(),
            user.password_hash().as_str(),
            user.full_name(),
            user.is_verified(),
            user.created_at(),
            user.updated_at(),
        )
        .execute(&self.pool)
        .await
        .map_err(|e| RepoError::Database(e.into()))?;

        Ok(())
    }

    #[tracing::instrument(skip(self))]
    async fn find_by_email(&self, email: &Email) -> Result<Option<User>, RepoError> {
        let row = sqlx::query!(
            r#"SELECT id, email, password_hash, full_name, is_verified, created_at, updated_at
               FROM users WHERE email = $1"#,
            email.as_str()
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| RepoError::Database(e.into()))?;

        Ok(row.map(|r| User {
            id: UserId::from_uuid(r.id),
            email: Email::parse(&r.email).unwrap(),
            password_hash: PasswordHash::from_str(&r.password_hash),
            full_name: r.full_name,
            is_verified: r.is_verified,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }
}
```

### 14.3 Redis Cache

```rust
use redis::{AsyncCommands, aio::ConnectionManager};

pub struct RedisCache {
    conn: ConnectionManager,
}

impl RedisCache {
    pub async fn new(redis_url: &str) -> Result<Self, RedisError> {
        let client = redis::Client::open(redis_url)?;
        let conn = ConnectionManager::new(client).await?;
        Ok(Self { conn })
    }

    #[tracing::instrument(skip(self, value))]
    pub async fn set_with_ttl(
        &mut self,
        key: &str,
        value: &str,
        ttl_seconds: usize,
    ) -> Result<(), RedisError> {
        self.conn.set_ex(key, value, ttl_seconds).await?;
        Ok(())
    }

    #[tracing::instrument(skip(self))]
    pub async fn get(&mut self, key: &str) -> Result<Option<String>, RedisError> {
        self.conn.get(key).await
    }

    #[tracing::instrument(skip(self))]
    pub async fn delete(&mut self, key: &str) -> Result<(), RedisError> {
        self.conn.del(key).await?;
        Ok(())
    }
}
```

---

## 15. Performance & Scalability

### 15.1 Performance Targets

| Metric | Target |
|--------|--------|
| **Latency (p50)** | < 5ms |
| **Latency (p95)** | < 10ms |
| **Latency (p99)** | < 50ms |
| **Throughput** | 10k+ RPS |
| **Memory** | < 50MB baseline |
| **CPU** | < 10% at 1k RPS |

### 15.2 Optimization Strategies

#### Database Connection Pooling

```rust
let pool = PgPoolOptions::new()
    .max_connections(20)
    .min_connections(5)
    .acquire_timeout(Duration::from_secs(3))
    .connect(&database_url)
    .await?;
```

#### Redis Connection Manager

```rust
// Reuses connections, multiplexes commands
let conn_manager = ConnectionManager::new(redis_client).await?;
```

#### Async Batching

```rust
// Batch multiple Redis operations
let mut pipe = redis::pipe();
pipe.get("key1").get("key2").get("key3");
let (val1, val2, val3): (String, String, String) = pipe.query_async(&mut conn).await?;
```

#### Response Compression

```rust
use tower_http::compression::CompressionLayer;

let app = Router::new()
    .route("/users", get(list_users))
    .layer(CompressionLayer::new());
```

### 15.3 Horizontal Scaling

- **Stateless design**: No in-memory sessions (use Redis)
- **Load balancing**: Behind Traefik/Nginx
- **Database read replicas**: For read-heavy operations
- **Redis cluster**: For high availability

### 15.4 Caching Strategy

```
┌──────────────┐
│   Request    │
└──────┬───────┘
       │
       ▼
┌──────────────┐   Cache Hit
│ Redis Cache  ├──────────────► Return cached
└──────┬───────┘
       │ Cache Miss
       ▼
┌──────────────┐
│  PostgreSQL  │
└──────┬───────┘
       │
       ▼
  Update Cache
```

---

## 16. Deployment Strategy

### 16.1 Build Process

```dockerfile
# Dockerfile
FROM rust:1.82-slim as builder

WORKDIR /app

# Cache dependencies
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Build application
COPY . .
RUN cargo build --release

# Runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/core-v2 /usr/local/bin/core-v2

EXPOSE 3000 50051

CMD ["core-v2"]
```

### 16.2 Docker Compose

```yaml
version: '3.8'

services:
  core-v2:
    build: .
    ports:
      - "3000:3000"
      - "50051:50051"
    environment:
      DATABASE_URL: postgres://user:pass@postgres:5432/core
      REDIS_URL: redis://redis:6379
      RUST_LOG: info
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: core
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 16.3 Health Checks

```rust
async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

let app = Router::new()
    .route("/health", get(health_check))
    .route("/login", post(login));
```

### 16.4 Graceful Shutdown

```rust
use tokio::signal;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let app = /* ... */;

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    let server = axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .with_graceful_shutdown(shutdown_signal());

    tracing::info!("Server listening on {}", addr);

    server.await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("Shutdown signal received, starting graceful shutdown");
}
```

---

## 17. Next Steps

### Phase 1: Foundation (Week 1-2)
- [ ] Project scaffolding (Cargo.toml, directory structure)
- [ ] Configuration management (dotenv, config crate)
- [ ] Tracing setup (tracing-subscriber)
- [ ] Database connection (SQLx pool)
- [ ] Redis connection
- [ ] Basic health check endpoint

### Phase 2: Domain Layer (Week 2-3)
- [ ] Define entities (User, Session, Token)
- [ ] Define value objects (Email, Password, UserId)
- [ ] Implement domain services (TokenService, PasswordService)
- [ ] Define repository traits
- [ ] Write unit tests for domain logic

### Phase 3: Infrastructure Layer (Week 3-4)
- [ ] PostgreSQL repository implementations
- [ ] Redis cache implementation
- [ ] SQLx migrations
- [ ] Integration tests with testcontainers

### Phase 4: Application Layer (Week 4-5)
- [ ] Register use case
- [ ] Login use case
- [ ] Logout use case
- [ ] Refresh token use case
- [ ] Define DTOs

### Phase 5: Presentation Layer (Week 5-6)
- [ ] Axum HTTP handlers
- [ ] Request validation
- [ ] Error responses
- [ ] Middleware (auth, tracing, CORS)
- [ ] OpenAPI documentation

### Phase 6: gRPC (Week 6-7)
- [ ] Define .proto files
- [ ] Implement gRPC server
- [ ] Integration with ai-service (Python client)

### Phase 7: Production Readiness (Week 7-8)
- [ ] Comprehensive testing (80%+ coverage)
- [ ] Performance benchmarking
- [ ] Security audit
- [ ] Documentation
- [ ] Deployment to VPS
- [ ] Monitoring & alerting

---

## Conclusion

This architecture document serves as the **blueprint** for core-v2. It emphasizes:

- **Type safety** via Rust's type system
- **Clean architecture** with clear boundaries
- **Testability** from day one
- **Observability** with tracing
- **Security** by design
- **Performance** and scalability

By following this design, we build a **production-grade microservice** that demonstrates Rust best practices and modern architectural patterns.

---

**Ready to build? Let's start with Phase 1! 🦀**

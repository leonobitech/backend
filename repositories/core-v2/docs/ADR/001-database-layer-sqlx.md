# ADR 001: Database Layer - SQLx over ORM

**Status:** ✅ Accepted
**Date:** 2025-11-18
**Author:** Felix @ Leonobitech
**Deciders:** Felix, Claude Code

---

## Context

We need to choose a database abstraction layer for core-v2 (Rust auth microservice). The main candidates are:

1. **SQLx** - Async SQL toolkit with compile-time checked queries
2. **SeaORM** - Modern async ORM (ActiveRecord/Repository patterns)
3. **Diesel** - Mature type-safe ORM (sync-first, diesel-async experimental)

**Previous experience:** Felix has prior experience with SeaORM in production.

**Project values:**
- Type safety extremo
- Functional programming
- Tracing & observability
- Maximum control
- Testing rigor

---

## Decision

**We will use SQLx** as the database layer for core-v2.

---

## Rationale

### 1. Compile-Time Safety (Critical)

**SQLx:**
```rust
// SQL verified against REAL database schema at compile-time
let user = sqlx::query_as!(
    User,
    "SELECT id, email FROM users WHERE email = $1",
    email
)
.fetch_one(&pool)
.await?;

// If you typo a column name or remove a field from DB:
// ❌ COMPILE ERROR - Won't even build
```

**SeaORM:**
```rust
// Runtime errors if schema changes
let user = User::find()
    .filter(user::Column::Email.eq(email))
    .one(&db)
    .await?;

// If schema changes:
// ✅ Compiles fine
// ❌ Runtime panic in production
```

**Impact:** With SQLx, **it's impossible to ship code with SQL schema mismatches**. This is a massive safety guarantee.

---

### 2. Functional Programming Alignment

**SQLx approach:**
```rust
// Pure function - no hidden state
async fn find_user_by_email(
    pool: &PgPool,
    email: &Email,
) -> Result<Option<User>, RepoError> {
    sqlx::query_as!(User, "SELECT * FROM users WHERE email = $1", email.as_str())
        .fetch_optional(pool)
        .await
        .map_err(Into::into)
}

// Data is just data (struct)
struct User {
    id: Uuid,
    email: String,
    // ... no methods, no behavior
}
```

**SeaORM approach:**
```rust
// ActiveRecord pattern - mutable state
let mut user: user::ActiveModel = user.into();
user.email = Set("new@email.com".to_owned());
user.update(&db).await?;

// Entity has behavior mixed with data
```

**Why this matters:**
- SQLx separates data from behavior (functional)
- SeaORM mixes them (OOP ActiveRecord)
- Our architecture uses pure domain entities + separate services

---

### 3. Explicit SQL = Better Observability

**SQLx:**
```rust
#[tracing::instrument(skip(pool))]
async fn get_user(pool: &PgPool, id: Uuid) -> Result<User, Error> {
    // Exact SQL is visible in code AND traces
    sqlx::query_as!(
        User,
        "SELECT id, email, created_at FROM users WHERE id = $1",
        id
    )
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}
```

**Tracing output:**
```
TRACE sqlx::query{sql="SELECT id, email, created_at FROM users WHERE id = $1" rows=1 elapsed=2ms}
```

**SeaORM:**
```rust
// Generated SQL is hidden
User::find_by_id(id).one(&db).await?
```

**Tracing output:**
```
DEBUG sea_orm{entity="User" operation="find"} // What SQL was executed? 🤷
```

**Impact:**
- SQLx makes performance debugging trivial (see exact queries)
- SeaORM requires enabling debug logging to see generated SQL

---

### 4. Performance & Control

**SQLx:**
- Zero abstraction overhead
- You write optimized SQL directly
- No N+1 queries by accident (you control JOINs)
- Prepared statements cached automatically

**SeaORM:**
- Abstraction layer overhead
- Generated SQL may not be optimal
- Easier to accidentally trigger N+1 queries
- Less control over query execution plan

**Example - Optimized query:**
```rust
// SQLx - write exactly what you need
sqlx::query!(
    r#"
    SELECT u.id, u.email, COUNT(s.id) as session_count
    FROM users u
    LEFT JOIN sessions s ON s.user_id = u.id
    WHERE u.created_at > $1
    GROUP BY u.id
    "#,
    since
)
.fetch_all(&pool)
.await?;

// SeaORM - need to learn how to express complex queries in builder API
// Or drop down to raw SQL anyway
```

---

### 5. Testing Strategy

**SQLx + Testcontainers:**
```rust
#[tokio::test]
async fn test_create_user() {
    // Real PostgreSQL in Docker
    let postgres = testcontainers::clients::Cli::default()
        .run(testcontainers::images::postgres::Postgres::default());

    let pool = PgPool::connect(&connection_string).await.unwrap();

    // Run REAL migrations
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    // Test against REAL database
    let repo = PostgresUserRepository::new(pool);
    let user = create_test_user();
    repo.save(&user).await.unwrap();

    let found = repo.find_by_email(&user.email).await.unwrap();
    assert_eq!(found.unwrap().id, user.id);
}
```

**Benefits:**
- Tests use REAL PostgreSQL (not mocks)
- Exact same SQL as production
- Catch migration issues in tests
- No need to mock ORM behaviors

---

### 6. Clean Architecture Compatibility

Our architecture uses **Repository Pattern** with traits:

```rust
// Domain layer defines interface (port)
#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn save(&self, user: &User) -> Result<(), RepoError>;
    async fn find_by_id(&self, id: &UserId) -> Result<Option<User>, RepoError>;
}

// Infrastructure implements it
pub struct PostgresUserRepository {
    pool: PgPool,  // SQLx pool - simple!
}

#[async_trait]
impl UserRepository for PostgresUserRepository {
    async fn save(&self, user: &User) -> Result<(), RepoError> {
        sqlx::query!(/* ... */).execute(&self.pool).await?;
        Ok(())
    }
}
```

**SQLx advantages:**
- Just a connection pool - no framework coupling
- Easy to implement repository trait
- No "fighting the framework"

**SeaORM:**
- Wants you to use its ActiveModel pattern
- Harder to fit into custom repository pattern
- More framework coupling

---

### 7. Migration Management

**SQLx:**
```sql
-- migrations/20250118_create_users.sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

```rust
// Embedded in binary, run at startup
sqlx::migrate!("./migrations").run(&pool).await?;
```

**Advantages:**
- Plain SQL files (portable, readable)
- Version controlled
- Can run with `sqlx migrate run` CLI
- Embedded in binary for production

**SeaORM:**
- Uses SeaORM CLI to generate migrations
- Migrations are Rust code (less portable)
- More tooling dependency

---

## Consequences

### Positive ✅

1. **Compile-time safety** - Schema mismatches caught at build time
2. **Explicit SQL** - Always know what queries run
3. **Performance** - Zero overhead, optimized queries
4. **Functional** - Fits functional programming style
5. **Tracing** - Excellent observability
6. **Testing** - Real DB tests with testcontainers
7. **Clean Architecture** - Easy repository pattern implementation

### Negative ❌

1. **More verbose** - Need to write SQL manually (vs query builder)
2. **Build dependency** - Needs database running to compile (solvable with offline mode)
3. **No auto-generated models** - Write structs manually (but we want custom domain entities anyway)

### Mitigations

**Build dependency:**
```bash
# For CI/CD - use offline mode with cached metadata
cargo sqlx prepare
# Commits .sqlx/ directory with query metadata
# Now can build without database
```

**Verbosity:**
- Accept it as explicitness (not a bug, a feature)
- Macros can reduce boilerplate for common patterns
- Worth it for safety guarantees

---

## Alternatives Considered

### SeaORM

**Pros:**
- Felix has prior experience
- Less verbose (query builder)
- Migrations CLI
- Modern async-first

**Cons:**
- Runtime errors (no compile-time checks)
- ActiveRecord pattern (less functional)
- Harder to trace exact SQL
- Framework coupling

**Decision:** Rejected - Safety and functional programming are higher priorities than convenience.

---

### Diesel

**Pros:**
- Very mature
- Compile-time safety
- Type-safe query builder

**Cons:**
- Sync-first (diesel-async is experimental)
- Heavy macro magic
- Steeper learning curve

**Decision:** Rejected - Async support not mature enough.

---

## References

- [SQLx GitHub](https://github.com/launchbadge/sqlx)
- [SQLx compile-time verification](https://github.com/launchbadge/sqlx#compile-time-verification)
- [Testcontainers Rust](https://github.com/testcontainers/testcontainers-rs)
- [Parse, Don't Validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)

---

## Status

**✅ Accepted** - SQLx will be used for all database interactions in core-v2.

This decision prioritizes:
- Type safety (compile-time verification)
- Functional programming (pure functions)
- Observability (explicit SQL)
- Testing rigor (real DB tests)
- Professional engineering practices

---

**Next steps:**
1. Setup SQLx in `Cargo.toml`
2. Configure database connection pool
3. Create initial migrations
4. Implement first repository with SQLx
5. Setup testcontainers for integration tests

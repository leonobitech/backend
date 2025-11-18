# 🦀 Serie de Blog: Rust en Producción - Core-v2

**Autor**: Felix @ Leonobitech
**Proyecto**: core-v2 - Microservicio de autenticación en Rust
**Objetivo**: Mostrar Rust en acción con código real, no solo teoría

---

## 📚 Estructura de la Serie

Esta serie documenta la construcción de **core-v2**, un microservicio de autenticación production-grade en Rust, explicando cada concepto con **código real y funcional**.

### 🎯 Enfoque de la Serie

- ✅ **Código real** del proyecto core-v2 (no ejemplos de juguete)
- ✅ **Explicaciones prácticas** de conceptos de Rust aplicados
- ✅ **Comparaciones** con TypeScript, Go, Python
- ✅ **Ventajas concretas** con métricas y ejemplos
- ✅ **Snippets ejecutables** que puedes probar
- ✅ **Problemas reales** y cómo Rust los resuelve

---

## 📖 Posts de la Serie

### Post 1: ¿Por qué Rust para Microservicios Críticos? 🚀
**Status**: ✅ Completo
**Archivo**: `01-why-rust-for-microservices.md`

**Qué aprenderás**:
- Por qué elegimos Rust sobre TypeScript/Go/Python
- Setup del proyecto con Cargo
- Arquitectura básica de Axum
- Primer servidor funcional en <100 líneas

**Conceptos de Rust**:
- Ownership básico
- Async/await con Tokio
- Pattern matching
- Error handling con Result

**Código destacado**:
- `src/main.rs` - Servidor Axum completo
- `Cargo.toml` - Gestión de dependencias
- Graceful shutdown signal handling

---

### Post 2: Type Safety Extremo - Parse, Don't Validate 🔒
**Status**: ⏳ Pendiente
**Archivo**: `02-type-safety-parse-dont-validate.md`

**Qué aprenderás**:
- Value Objects: Email, Password, UserId
- "Parse, Don't Validate" pattern en acción
- Cómo hacer estados ilegales irrepresentables
- Phantom types para type-state pattern

**Conceptos de Rust**:
- Newtypes (tuple structs)
- Type system avanzado
- Trait implementations (Display, FromStr)
- Phantom types
- Compile-time guarantees

**Código destacado**:
- `src/domain/value_objects/email.rs`
- `src/domain/value_objects/password.rs`
- `src/domain/value_objects/user_id.rs`

**Comparación**:
```typescript
// TypeScript - Runtime validation
function validateEmail(email: string): boolean {
  return email.includes('@'); // Can still use invalid email!
}

// Rust - Compile-time safety
struct Email(String);
impl Email {
  fn parse(s: &str) -> Result<Self, EmailError> {
    // If you have an Email, it's GUARANTEED valid
  }
}
```

---

### Post 3: Arquitectura Limpia en Rust 🏗️
**Status**: ⏳ Pendiente
**Archivo**: `03-clean-architecture-in-rust.md`

**Qué aprenderás**:
- Clean Architecture aplicada (Domain, Application, Infrastructure, Presentation)
- Dependency injection con traits
- Repository pattern sin ORM magic
- Separation of concerns extrema

**Conceptos de Rust**:
- Traits como interfaces (ports)
- Trait objects vs generics
- Módulos y visibilidad
- async-trait para traits async

**Código destacado**:
- `src/domain/repositories/` - Repository traits
- `src/infrastructure/database/postgres/` - Implementaciones
- `src/application/commands/` - Use cases

**Arquitectura visual**:
```
Presentation → Application → Domain ← Infrastructure
      ↓              ↓           ↑           ↑
   Axum HTTP    Use Cases   Entities    PostgreSQL
                             Traits      Redis
```

---

### Post 4: SQLx - SQL Type-Safe en Compile Time 💎
**Status**: ⏳ Pendiente
**Archivo**: `04-sqlx-compile-time-sql.md`

**Qué aprenderás**:
- Por qué SQLx > ORMs tradicionales
- Compile-time SQL verification contra DB real
- Migrations con SQLx
- Testing con Testcontainers

**Conceptos de Rust**:
- Macros procedurales (sqlx::query!)
- Compile-time computation
- Type inference avanzado
- Zero-cost abstractions

**Código destacado**:
```rust
// Esto NO COMPILA si la tabla/columna no existe!
let user = sqlx::query_as!(
    User,
    "SELECT id, email FROM users WHERE email = $1",
    email
)
.fetch_one(&pool)
.await?;
```

**Comparación con ORMs**:
| Feature | SQLx | SeaORM | Diesel |
|---------|------|--------|--------|
| Compile-time safety | ✅ | ❌ | ✅ |
| Explicit SQL | ✅ | ❌ | ❌ |
| Async-native | ✅ | ✅ | ❌ |

---

### Post 5: Error Handling Profesional en Rust ⚠️
**Status**: ⏳ Pendiente
**Archivo**: `05-error-handling-professional.md`

**Qué aprenderás**:
- Error hierarchy (Domain → App → API)
- thiserror para custom errors
- Error propagation con `?`
- No panics en producción

**Conceptos de Rust**:
- Result<T, E> como monad
- Error trait
- From trait para conversiones
- thiserror vs anyhow

**Código destacado**:
```rust
#[derive(Debug, Error)]
pub enum DomainError {
    #[error("Invalid email format")]
    InvalidEmail,

    #[error("Password too short (minimum 8 characters)")]
    PasswordTooShort,
}

// Automáticamente se convierte DomainError → AppError
impl From<DomainError> for AppError {
    fn from(err: DomainError) -> Self {
        AppError::Domain(err)
    }
}
```

---

### Post 6: Tracing y Observabilidad - Debugging en Producción 🔍
**Status**: ⏳ Pendiente
**Archivo**: `06-tracing-observability.md`

**Qué aprenderás**:
- Structured logging con tracing
- Spans y eventos jerárquicos
- OpenTelemetry integration
- Performance profiling

**Conceptos de Rust**:
- Procedural macros (#[instrument])
- Trait objects para subscribers
- Context propagation en async
- Zero-cost logging

**Código destacado**:
```rust
#[tracing::instrument(skip(self, password))]
pub async fn login(
    &self,
    email: Email,
    password: String,
) -> Result<Token, AppError> {
    info!("Attempting login");
    // Automáticamente añade email al trace context
}
```

---

### Post 7: Testing con Testcontainers - Real Database Tests 🧪
**Status**: ⏳ Pendiente
**Archivo**: `07-testing-testcontainers.md`

**Qué aprenderás**:
- Testing pyramid en Rust
- Unit tests para domain logic
- Integration tests con PostgreSQL real
- Property-based testing con quickcheck

**Conceptos de Rust**:
- #[cfg(test)] y módulos de test
- async testing con tokio::test
- Mock traits con mockall
- Testcontainers-rs

**Código destacado**:
```rust
#[tokio::test]
async fn test_user_repository_save() {
    // PostgreSQL REAL en Docker
    let postgres = testcontainers::postgres::Postgres::default();
    let pool = PgPool::connect(&connection_string).await?;

    // Run migrations
    sqlx::migrate!().run(&pool).await?;

    // Test contra DB real
    let repo = PostgresUserRepository::new(pool);
    repo.save(&user).await?;

    // ✅ Tests usan EXACTAMENTE el mismo código que producción
}
```

---

### Post 8 (Bonus): Deployment Production - Docker + VPS 🚀
**Status**: ⏳ Pendiente
**Archivo**: `08-production-deployment.md`

**Qué aprenderás**:
- Multi-stage Dockerfile optimizado
- Binary size optimization
- docker-compose con PostgreSQL + Redis
- Deployment en VPS

**Conceptos de Rust**:
- Cross-compilation
- Release profiles
- LTO y codegen-units
- Strip symbols

---

## 🎯 Formato de Cada Post

Cada post sigue esta estructura:

1. **Problema Real** - Plantea un problema concreto
2. **Solución en Rust** - Muestra código del proyecto
3. **Conceptos de Rust** - Explica el "por qué funciona"
4. **Comparación** - TypeScript/Go/Python equivalent
5. **Ventajas Medibles** - Performance, safety, DX
6. **Try It Yourself** - Código ejecutable para probar
7. **Conclusión** - Recap y siguiente paso

---

## 📊 Métricas del Proyecto Core-v2

Para dar contexto en los posts:

- **Lenguaje**: Rust (edition 2021)
- **Líneas de código**: ~3,250 (documentación + código)
- **Compile time**: ~30s (clean build)
- **Binary size**: ~8MB (release, stripped)
- **Memory usage**: <20MB baseline
- **Latency p95**: <5ms (health check)
- **Dependencies**: 40+ crates
- **Test coverage**: TBD (target 80%+)

---

## 🎨 Estilo de Escritura

- **Tono**: Profesional pero accesible
- **Código**: Snippets reales del proyecto + explicaciones
- **Comparaciones**: Objetivas, sin FUD
- **Enfoque**: "Show, don't tell"
- **Audiencia**: Developers con experiencia en TypeScript/Go que quieren aprender Rust

---

## 🔗 Links Útiles

- [Repositorio core-v2](https://github.com/leonobitech/core-v2)
- [Documentación de Rust](https://doc.rust-lang.org/book/)
- [Axum Documentation](https://docs.rs/axum)
- [SQLx Documentation](https://docs.rs/sqlx)
- [Tokio Tutorial](https://tokio.rs/tokio/tutorial)

---

## ✍️ Contribuciones

Estos posts son **open source** y parte del proyecto core-v2. Si encuentras errores o quieres mejorar explicaciones, PRs bienvenidos!

---

**Siguiente**: Lee el [Post 1: ¿Por qué Rust para Microservicios Críticos?](01-why-rust-for-microservices.md)

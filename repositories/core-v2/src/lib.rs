//! Core-v2: Production-grade authentication and business logic microservice
//!
//! # Architecture
//!
//! This crate follows Clean Architecture principles with clear layer separation:
//!
//! - **Domain**: Pure business logic (entities, value objects, domain services)
//! - **Application**: Use cases orchestrating domain + infrastructure
//! - **Infrastructure**: External I/O (database, cache, email, gRPC)
//! - **Presentation**: HTTP/gRPC handlers and middleware
//!
//! # Features
//!
//! - Type-safe authentication with JWT
//! - Compile-time checked SQL queries (SQLx)
//! - Comprehensive tracing and observability
//! - Functional programming patterns
//! - Production-ready error handling

pub mod application;
pub mod config;
pub mod domain;
pub mod infrastructure;
pub mod observability;
pub mod presentation;
pub mod utils;

// Re-exports for convenience
pub use config::Settings;

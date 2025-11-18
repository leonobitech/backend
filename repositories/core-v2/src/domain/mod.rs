//! Domain layer: Pure business logic
//!
//! Contains entities, value objects, domain services, and repository traits.
//! This layer has NO dependencies on external frameworks or libraries.

pub mod entities;
pub mod errors;
pub mod repositories;
pub mod services;
pub mod value_objects;

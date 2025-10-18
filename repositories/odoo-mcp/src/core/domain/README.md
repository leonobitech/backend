# Domain Layer

Esta capa contiene la **lógica de negocio pura** del conector MCP. No tiene dependencias externas y define las reglas del dominio.

## 📂 Estructura

### `entities/`
Entidades del dominio con identidad única:
- `User.ts` - Usuario autenticado
- `OAuthToken.ts` - Token OAuth con metadata
- `Tool.ts` - Herramienta MCP
- `Resource.ts` - Recurso MCP

### `value-objects/`
Objetos de valor inmutables sin identidad:
- `AccessToken.ts` - Token de acceso con validación
- `Scope.ts` - Scope OAuth con validación
- `ClientId.ts` - ID de cliente con formato

### `events/`
Eventos del dominio (Domain Events):
- `UserAuthenticated.ts` - Usuario se autenticó
- `TokenRefreshed.ts` - Token fue refrescado
- `ToolExecuted.ts` - Herramienta fue ejecutada

## 🎯 Principios

1. **Sin dependencias externas**: No importa nada de `adapters` o `shared`
2. **Lógica de negocio pura**: Solo reglas del dominio
3. **Inmutabilidad**: Los value objects son inmutables
4. **Validación**: Toda validación de reglas de negocio está aquí

## 📝 Ejemplo

```typescript
// Value Object
class AccessToken {
  private constructor(private readonly value: string) {}

  static create(token: string): AccessToken {
    if (!token || token.length < 10) {
      throw new Error('Invalid token');
    }
    return new AccessToken(token);
  }

  getValue(): string {
    return this.value;
  }
}
```

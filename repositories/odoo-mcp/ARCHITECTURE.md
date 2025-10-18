# 🏗️ Odoo MCP - Arquitectura Hexagonal

Este documento explica la arquitectura modular y granular del conector Odoo MCP.

---

## 📐 Principios de Diseño

### 1. Arquitectura Hexagonal (Ports & Adapters)

```
┌─────────────────────────────────────────────────────────────┐
│                        ADAPTERS IN                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │   HTTP   │  │   MCP    │  │   CLI    │                  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                  │
│       │             │              │                         │
│       └─────────────┼──────────────┘                         │
│                     │                                        │
│   ┌─────────────────▼─────────────────────┐                 │
│   │          PORTS (Interfaces)           │                 │
│   │  ┌─────────────┐  ┌──────────────┐   │                 │
│   │  │  Use Cases  │  │ Repositories │   │                 │
│   │  └──────┬──────┘  └──────┬───────┘   │                 │
│   │         │                 │           │                 │
│   │    ┌────▼─────────────────▼────┐      │                 │
│   │    │       CORE DOMAIN         │      │                 │
│   │    │  ┌──────────┐             │      │                 │
│   │    │  │Entities  │             │      │                 │
│   │    │  │VObjects  │             │      │                 │
│   │    │  │Events    │             │      │                 │
│   │    │  └──────────┘             │      │                 │
│   │    └──────────────────────────┘      │                 │
│   └───────────────────────────────────────┘                 │
│                     │                                        │
│       ┌─────────────┼──────────────┐                         │
│       │             │              │                         │
│  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐                  │
│  │  Redis   │  │   Odoo   │  │   Keys   │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│                   ADAPTERS OUT                              │
└─────────────────────────────────────────────────────────────┘
```

### 2. Modularidad Extrema

Cada tool, resource y prompt está en su propia carpeta con:
- ✅ README.md - Documentación completa
- ✅ *.tool.ts - Implementación
- ✅ *.schema.ts - Validación Zod
- ✅ *.test.ts - Tests unitarios (futuro)

### 3. Separación de Responsabilidades

- **Core**: Lógica de negocio pura (sin dependencias externas)
- **Adapters**: Implementaciones concretas (HTTP, MCP, Redis, Odoo)
- **Tools**: Funcionalidades MCP modulares
- **Shared**: Utilidades compartidas

---

## 📂 Estructura de Directorios

```
src/
├── core/                           # 🎯 DOMINIO (sin dependencias externas)
│   ├── domain/
│   │   ├── entities/               # Entidades con identidad
│   │   │   ├── OAuthToken.ts       # Token OAuth con validaciones
│   │   │   ├── User.ts             # Usuario del sistema
│   │   │   └── Tool.ts             # Herramienta MCP
│   │   ├── value-objects/          # Objetos de valor inmutables
│   │   │   ├── AccessToken.ts      # Token de acceso
│   │   │   ├── Scope.ts            # Scope OAuth
│   │   │   └── ClientId.ts         # ID de cliente
│   │   └── events/                 # Eventos del dominio
│   │       ├── UserAuthenticated.ts
│   │       ├── TokenRefreshed.ts
│   │       └── ToolExecuted.ts
│   │
│   ├── ports/                      # 🔌 INTERFACES (contratos)
│   │   ├── in/                     # Puertos de entrada (use cases)
│   │   │   ├── auth/
│   │   │   │   ├── InitiateOAuth.ts
│   │   │   │   ├── ExchangeCode.ts
│   │   │   │   ├── RefreshToken.ts
│   │   │   │   └── RevokeToken.ts
│   │   │   └── mcp/
│   │   │       ├── ListTools.ts
│   │   │       ├── ExecuteTool.ts
│   │   │       ├── ListResources.ts
│   │   │       └── ReadResource.ts
│   │   └── out/                    # Puertos de salida (repositorios)
│   │       ├── TokenRepository.ts
│   │       ├── UserRepository.ts
│   │       ├── KeyStore.ts
│   │       └── ExternalService.ts
│   │
│   └── use-cases/                  # 💼 CASOS DE USO (lógica de aplicación)
│       ├── auth/
│       │   ├── InitiateOAuthUseCase.ts
│       │   ├── ExchangeCodeUseCase.ts
│       │   ├── RefreshTokenUseCase.ts
│       │   └── RevokeTokenUseCase.ts
│       └── mcp/
│           ├── ListToolsUseCase.ts
│           ├── ExecuteToolUseCase.ts
│           ├── ListResourcesUseCase.ts
│           └── ReadResourceUseCase.ts
│
├── adapters/                       # 🔌 ADAPTADORES (implementaciones)
│   ├── in/                         # Entrada (HTTP, MCP)
│   │   ├── http/
│   │   │   ├── routes/             # Rutas Express
│   │   │   │   ├── health.routes.ts
│   │   │   │   ├── oauth.routes.ts
│   │   │   │   └── well-known.routes.ts
│   │   │   ├── controllers/        # Controladores
│   │   │   │   ├── OAuthController.ts
│   │   │   │   └── HealthController.ts
│   │   │   └── middleware/         # Middlewares
│   │   │       ├── authenticate.ts
│   │   │       ├── errorHandler.ts
│   │   │       └── logger.ts
│   │   └── mcp/                    # MCP Server
│   │       ├── McpServer.ts
│   │       ├── McpHttpAdapter.ts
│   │       └── McpSseAdapter.ts
│   │
│   └── out/                        # Salida (Redis, Odoo)
│       ├── persistence/            # Persistencia Redis
│       │   ├── RedisTokenRepository.ts
│       │   ├── RedisUserRepository.ts
│       │   └── RedisClient.ts
│       ├── key-store/              # Almacenamiento de claves
│       │   ├── FileSystemKeyStore.ts
│       │   └── generateKeys.ts
│       └── external/               # Servicios externos
│           └── odoo/
│               ├── OdooClient.ts   # Cliente Odoo base
│               ├── OdooAdapter.ts  # Adaptador al puerto
│               └── models/         # Modelos Odoo
│                   ├── CrmLead.ts
│                   └── ResPartner.ts
│
├── tools/                          # 🛠️ TOOLS MCP (modular y granular)
│   ├── base/
│   │   ├── Tool.interface.ts       # Interfaz base para tools
│   │   ├── ToolRegistry.ts         # Registro de tools
│   │   └── ToolExecutor.ts         # Ejecutor de tools
│   │
│   └── odoo/                       # Tools de Odoo
│       ├── crm/                    # CRM Tools
│       │   ├── get-leads/
│       │   │   ├── README.md       # 📖 Documentación completa
│       │   │   ├── get-leads.tool.ts
│       │   │   └── get-leads.schema.ts
│       │   ├── create-lead/
│       │   │   ├── README.md
│       │   │   ├── create-lead.tool.ts
│       │   │   └── create-lead.schema.ts
│       │   ├── get-opportunities/
│       │   └── update-deal-stage/
│       │
│       ├── contacts/               # Contact Tools
│       │   ├── search-contacts/
│       │   └── create-contact/
│       │
│       ├── calendar/               # Calendar Tools
│       │   └── schedule-meeting/
│       │
│       └── email/                  # Email Tools
│           ├── send-email/
│           └── send-proposal/
│
├── resources/                      # 📚 RESOURCES MCP (modular)
│   ├── base/
│   │   ├── Resource.interface.ts
│   │   └── ResourceRegistry.ts
│   └── odoo/
│       ├── crm-pipeline/
│       └── sales-report/
│
├── prompts/                        # 💬 PROMPTS MCP (modular)
│   ├── base/
│   │   ├── Prompt.interface.ts
│   │   └── PromptRegistry.ts
│   └── odoo/
│       ├── analyze-pipeline/
│       └── draft-proposal/
│
└── shared/                         # 🔧 COMPARTIDO (infraestructura)
    ├── config/
    │   ├── env.ts                  # Variables de entorno
    │   └── constants.ts            # Constantes
    ├── utils/
    │   ├── logger.ts               # Logger estructurado
    │   ├── errors.ts               # Errores personalizados
    │   └── validation.ts           # Validaciones
    └── types/
        ├── index.ts
        └── xmlrpc.d.ts
```

---

## 🔄 Flujo de una Petición

### Ejemplo: Ejecutar `odoo_get_leads`

```
1. Claude Desktop → HTTP POST /mcp/tools/call
   ↓
2. McpHttpAdapter (adapters/in/mcp)
   ↓ valida autenticación
3. ExecuteToolUseCase (core/use-cases/mcp)
   ↓ busca tool en registry
4. GetLeadsTool (tools/odoo/crm/get-leads)
   ↓ valida input con Zod
5. OdooClient (adapters/out/external/odoo)
   ↓ ejecuta XML-RPC
6. Odoo API
   ↓ retorna datos
7. GetLeadsTool formatea respuesta
   ↓
8. ExecuteToolUseCase retorna resultado
   ↓
9. McpHttpAdapter serializa JSON
   ↓
10. Claude Desktop ← HTTP 200 OK
```

---

## 📝 Cómo Agregar una Nueva Tool

### Paso 1: Crear Estructura

```bash
mkdir -p src/tools/odoo/categoria/nombre-tool
cd src/tools/odoo/categoria/nombre-tool
```

### Paso 2: Crear README.md

```markdown
# Tool: odoo_nombre_tool

## Descripción
[Qué hace la tool]

## Categoría
[Categoría]

## Parámetros
[Tabla de parámetros]

## Respuesta
[Schema de respuesta]

## Ejemplos
[Ejemplos de uso]
```

### Paso 3: Crear Schema (nombre-tool.schema.ts)

```typescript
import { z } from "zod";

export const nombreToolSchema = z.object({
  // Define parámetros
});

export type NombreToolInput = z.infer<typeof nombreToolSchema>;
```

### Paso 4: Crear Tool (nombre-tool.tool.ts)

```typescript
export class NombreToolTool {
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown) {
    const params = nombreToolSchema.parse(input);
    // Lógica de negocio
    return resultado;
  }

  static definition() {
    return {
      name: "odoo_nombre_tool",
      description: "...",
      inputSchema: { ... }
    };
  }
}
```

### Paso 5: Registrar en ToolRegistry

```typescript
// src/tools/base/ToolRegistry.ts
registry.register(new NombreToolTool(odooClient));
```

---

## 🧪 Testing

### Estructura de Tests

```
tests/
├── unit/
│   ├── core/
│   │   ├── domain/
│   │   │   └── entities/
│   │   │       └── OAuthToken.test.ts
│   │   └── use-cases/
│   │       └── auth/
│   │           └── InitiateOAuthUseCase.test.ts
│   ├── adapters/
│   └── tools/
│       └── odoo/
│           └── crm/
│               └── get-leads/
│                   └── get-leads.tool.test.ts
├── integration/
└── e2e/
```

### Ejemplo de Test

```typescript
import { GetLeadsTool } from './get-leads.tool';

describe('GetLeadsTool', () => {
  it('should validate input parameters', () => {
    const tool = new GetLeadsTool(mockOdooClient);

    expect(() => {
      tool.execute({ limit: -1 });
    }).toThrow('limit must be positive');
  });

  it('should fetch leads from Odoo', async () => {
    const tool = new GetLeadsTool(mockOdooClient);
    const result = await tool.execute({ limit: 5 });

    expect(result.leads).toHaveLength(5);
  });
});
```

---

## 🚀 Deployment

### Docker Build

```bash
docker build -t leonobitech/odoo-mcp:2.0.0 .
```

### Environment Variables

Ver [README.md](./README.md#configuration) para lista completa.

---

## 📚 Referencias

- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html)
- [MCP Protocol](https://modelcontextprotocol.io)
- [Odoo XML-RPC API](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html)

---

## 🤝 Contribuir

Para agregar nuevas tools, resources o prompts, sigue la estructura modular:

1. Crea carpeta en `tools/odoo/[categoria]/[nombre]/`
2. Agrega README.md completo
3. Implementa tool.ts y schema.ts
4. Registra en ToolRegistry
5. Agrega tests
6. Actualiza documentación

---

**Made with ❤️ by Leonobitech**

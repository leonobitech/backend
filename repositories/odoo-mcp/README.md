# 🚀 Odoo MCP Server

> **Control your Odoo CRM, contacts, calendar and email from Claude Desktop**

A production-ready MCP (Model Context Protocol) server that enables Claude Desktop to interact with your Odoo instance through OAuth2-authenticated tools.

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/leonobitech/odoo-mcp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.20.0-purple.svg)](https://modelcontextprotocol.io)
[![Odoo](https://img.shields.io/badge/Odoo-19-8f0adb.svg)](https://www.odoo.com)

---

## ✨ Features

### 🔐 Secure Authentication
- OAuth2 + PKCE flow for secure authorization
- RSA-signed JWT tokens (RS256)
- Redis-based token management with automatic refresh
- Client fingerprinting for enhanced security

### 🛠️ 8 Powerful Tools

#### CRM Management
- **`odoo_get_leads`** - Fetch leads with advanced filtering
- **`odoo_create_lead`** - Create new leads with automatic contact creation
- **`odoo_get_opportunities`** - Track sales opportunities
- **`odoo_update_deal_stage`** - Move deals through your pipeline

#### Contact Management
- **`odoo_search_contacts`** - Search customers and partners
- **`odoo_create_contact`** - Add new contacts to your database

#### Calendar & Communication
- **`odoo_schedule_meeting`** - Book meetings with availability checking
- **`odoo_send_email`** - Send emails linked to opportunities

### 🎯 Intelligent Features
- **Auto-progression**: Deals automatically advance when you send emails or schedule meetings
- **Smart templates**: Professional email templates for proposals
- **Chatter integration**: All actions logged in Odoo's activity feed
- **Conflict detection**: Calendar checks availability before booking

---

## 📦 Quick Start

### Prerequisites

- Node.js >= 22.20.0
- Redis server
- Odoo instance (tested on Odoo 19)
- Claude Desktop app

### Installation

```bash
# Clone the repository
git clone https://github.com/leonobitech/odoo-mcp.git
cd odoo-mcp

# Install dependencies
npm install

# Generate RSA keys for JWT signing
npm run generate:keys

# Configure environment
cp .env.example .env
# Edit .env with your Odoo credentials

# Start in development mode
npm run dev
```

### Configuration

Create a `.env` file with:

```env
# Server
NODE_ENV=development
PORT=8100
PUBLIC_URL=http://localhost:8100

# OAuth
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
REDIRECT_URI=http://localhost:8100/oauth/callback
SCOPES=odoo:read odoo:write

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=2

# RSA Keys (for JWT signing)
RSA_PRIVATE_KEY_PATH=./keys/privateKey.pem
RSA_PUBLIC_KEY_PATH=./keys/publicKey.pem

# Odoo
ODOO_URL=https://your-odoo-instance.com
ODOO_DB=your-database-name
ODOO_USERNAME=your-email@example.com
ODOO_API_KEY=your-odoo-api-key
```

### Connect to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "odoo": {
      "command": "npx",
      "args": [
        "-y",
        "@leonobitech/odoo-mcp"
      ],
      "env": {
        "ODOO_URL": "https://your-odoo-instance.com",
        "ODOO_DB": "your-database",
        "ODOO_USERNAME": "your-email@example.com",
        "ODOO_API_KEY": "your-api-key"
      }
    }
  }
}
```

Restart Claude Desktop and you're ready! 🎉

---

## 🎬 Demo

Check out our [LinkedIn video demo](https://www.linkedin.com/in/felix-leonobitech) showing the connector in action:

- Creating leads from natural language
- Scheduling meetings with availability detection
- Sending professional proposals
- Auto-progression through CRM stages

---

## 📚 Documentation

- **[Architecture Overview](./docs/architecture/overview.md)** - Hexagonal architecture design
- **[Deployment Guide](./docs/guides/deployment.md)** - Production deployment instructions
- **[Claude Desktop Setup](./docs/guides/claude-desktop-setup.md)** - Configure Claude Desktop
- **[Odoo Tools Reference](./docs/guides/odoo-tools.md)** - Complete API documentation
- **[Testing Guide](./docs/guides/testing.md)** - How to test all tools
- **[Troubleshooting](./docs/guides/troubleshooting.md)** - Common issues and solutions

### 📖 Tutorials (Build Your Own)

Learn how to build this connector from scratch:

1. [Minimal Connector](./docs/tutorials/01-minimal-connector.md) - Hello World MCP server
2. [Adding OAuth](./docs/tutorials/02-adding-auth.md) - Secure authentication flow
3. [First Tool](./docs/tutorials/03-first-tool.md) - Create your first MCP tool
4. [Odoo Integration](./docs/tutorials/04-odoo-integration.md) - Connect to Odoo XML-RPC
5. [Advanced Features](./docs/tutorials/05-advanced-features.md) - Smart templates & auto-progression

---

## 🏗️ Architecture

This project follows **Hexagonal Architecture** (Ports & Adapters) for maximum maintainability and testability:

```
src/
├── core/              # Domain logic (business rules)
│   ├── domain/        # Entities, value objects, events
│   ├── ports/         # Interfaces (contracts)
│   └── use-cases/     # Application logic
├── adapters/          # External implementations
│   ├── in/            # HTTP, MCP server
│   └── out/           # Redis, Odoo client
├── tools/             # MCP tools (modular)
├── resources/         # MCP resources
├── prompts/           # MCP prompts
└── shared/            # Infrastructure utilities
```

Each tool is **self-contained** with its own:
- Implementation file (`*.tool.ts`)
- Schema validation (`*.schema.ts`)
- Documentation (`README.md`)

---

## 🛠️ Development

```bash
# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Type checking
npm run lint

# Generate new RSA keys
npm run generate:keys
```

---

## 🐳 Docker Deployment

```bash
# Build image
docker build -t leonobitech/odoo-mcp:latest .

# Run container
docker run -d \
  --name odoo-mcp \
  -p 8100:8100 \
  --env-file .env \
  leonobitech/odoo-mcp:latest
```

### Docker Compose

```yaml
services:
  odoo-mcp:
    build: .
    container_name: odoo-mcp
    ports:
      - "8100:8100"
    env_file: .env
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Add new tools**: Create tools for other Odoo modules (Sales, Inventory, etc.)
2. **Improve documentation**: Help others learn
3. **Report bugs**: Open issues with detailed reproduction steps
4. **Suggest features**: Share your ideas

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details

---

## 🌟 Acknowledgments

- Built with [MCP SDK](https://modelcontextprotocol.io) by Anthropic
- Powered by [Odoo](https://www.odoo.com) open-source ERP
- Created by [Leonobitech](https://leonobitech.com)

---

## 📞 Support

- 🌐 Website: [leonobitech.com](https://leonobitech.com)
- 📧 Email: felix@leonobitech.com
- 💼 LinkedIn: [Felix Leonobitech](https://www.linkedin.com/in/felix-leonobitech)
- 🐛 Issues: [GitHub Issues](https://github.com/leonobitech/odoo-mcp/issues)

---

<p align="center">
  <strong>Made with ❤️ by Leonobitech</strong><br>
  Empowering businesses with AI-powered automation
</p>

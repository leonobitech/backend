# CLAUDE.md — Qdrant

Base de datos vectorial para RAG (Retrieval-Augmented Generation).

---

## Overview

**Status**: En produccion
**Stack**: Qdrant (Docker)

---

## Colecciones

- **servicios_leraysi**: Embeddings de servicios del salon para busqueda semantica (tool `qdrant_servicios_leraysi`)

---

## Pipeline de datos

```
Baserow (ServiciosLeraysi, tabla 850)
  -> n8n workflow "Load Services"
    -> Embeddings (OpenAI)
      -> Qdrant coleccion
```

---

## TODO

- [ ] Documentar colecciones existentes y sus schemas
- [ ] Documentar modelo de embeddings usado
- [ ] Documentar configuracion Docker y puertos
- [ ] Documentar como agregar nuevas colecciones para otros agentes

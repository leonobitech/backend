# 📊 Monitoreo de Procesos Node – VPS Leonobitech

Este anexo documenta el comportamiento y control específico de procesos `node` en el entorno del VPS Leonobitech, como parte del sistema de auditoría implementado en `/usr/local/bin/vps-monitor`.

---

## 🤖 Contexto

El stack de servicios de Leonobitech incluye varios procesos Node.js totalmente válidos, como:

- `n8n` (core, workers, webhooks)
- `core-api` o microservicios en `Node + TS`
- Frontend desacoplado de Baserow (Nuxt.js)

Por ello, el sistema de auditoría realiza una detección **inteligente y selectiva** para evitar falsos positivos.

---

## 🧠 Lógica de auditoría

### Script: `/usr/local/bin/vps-monitor`

El script cuenta los procesos `node` activos y revisa si coinciden con una **whitelist validada**.

### Lógica:

```bash
ps -eo pid,ppid,cmd --sort=-%mem | grep -w "node" | grep -v grep
```

### Umbral configurable:
```bash
MAX_NODE_PROCESSES=10
```

### Condiciones de alerta:
- Si la cantidad total de procesos `node` excede `MAX_NODE_PROCESSES`
- O si existen procesos `node` que **no estén en la whitelist**

---

## ✅ Whitelist actual

Los siguientes comandos se consideran seguros:

```bash
WHITELIST=(
  "/usr/local/bin/n8n"
  "/usr/local/bin/n8n worker"
  "/usr/local/bin/n8n webhook"
  "/baserow/web-frontend/node_modules/.bin/nuxt"
  "/node_modules/@n8n/task-runner/dist/start.js"
  "dist/index.mjs"
)
```

> Cualquier proceso que no coincida parcial o completamente con alguno de estos patrones se considera **sospechoso**.

---

## 📦 Ejemplo de salida de alerta

```bash
⚠️  Hay 9 procesos 'node' en ejecución. Sospechosos: 3. Revisión recomendada.
3814088 node /baserow/web-frontend/node_modules/.bin/nuxt start ...
596247  node /usr/local/bin/n8n
600437  node /usr/local/bin/n8n worker
... (otros recortados)
```

---

## 📁 Archivos clave

- `/usr/local/bin/vps-monitor` → script principal
- `/var/log/msmtp-root.log` → log diario (incluye detalle de procesos `node`)

---

## 🔐 Mejores prácticas

- Mantener la whitelist actualizada con paths reales
- Asegurarse de que cada microservicio `node` tenga su `CMD` bien definido
- Automatizar el monitoreo vía `cron` o `systemd timer`
- Enviar reportes vía email solo si hay sospechosos

---

## ✨ Mantenido por

**Leonobitech Dev Team**
https://www.leonobitech.com
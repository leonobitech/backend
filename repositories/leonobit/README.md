# Leonobit WebRTC / WebSocket Server

Este proyecto es una instancia inicial en **Rust** usando [Axum](https://github.com/tokio-rs/axum), preparada para evolucionar hacia un servidor **WebRTC** de baja latencia.  
Actualmente incluye soporte **WebSocket** para pruebas de señalización en tiempo real.

## ✨ Características actuales
- Servidor HTTP con **Axum**
- Endpoints de ejemplo (`/`, `/user`, `/hello`, `/health`)
- **Endpoint WebSocket** (`/ws/offer`) con:
  - Recepción y eco de mensajes
  - Mensajes automáticos periódicos
  - Manejo de `Ping/Pong` (keep-alive)
- Configuración **CORS** vía `tower-http`
- Contenedor Docker seguro con **Traefik** como proxy inverso

---

## 📂 Estructura del proyecto
```
src/
├── config/
│   ├── cors.rs          # Configuración de CORS
│   └── mod.rs
├── routes/
│   ├── mod.rs
│   ├── hello_routes.rs
│   └── webrtc_routes.rs # Lógica de WebSocket
├── lib.rs
└── main.rs
Cargo.toml
Dockerfile
docker-compose.yml
ws-test-local.html
```

---

## 🚀 Ejecución local

### Requisitos
- [Rust](https://www.rust-lang.org/) (1.80+ recomendado)
- [Cargo](https://doc.rust-lang.org/cargo/)
- [Docker](https://www.docker.com/) (opcional para contenedor)

### 🔹 Ejecutar en local (modo desarrollo)

> **Nota:** El servidor exige que la variable `CORS_ORIGIN` esté definida.  
> En local puedes usar el mismo dominio de producción para evitar errores CORS.

```bash
export CORS_ORIGIN="https://www.leonobitech.com"
cargo run
```
Servidor disponible en: <http://localhost:8000>

---

### 🔹 Probar WebSocket en local

Incluimos **`ws-test-local.html`** para verificar la conexión WebSocket sin instalar nada:

1. Abrir `ws-test-local.html` en el navegador.
2. Pulsar **Conectar** (se conecta a `ws://localhost:8000/ws/offer`).
3. Pulsar **Enviar mensaje** y ver las respuestas del servidor.

Resultado esperado:
- ✅ Conexión establecida
- 📩 Eco de mensajes enviados
- 🤖 Mensajes automáticos del servidor cada 30s

---

### 🔹 Ejecutar con Docker

```bash
docker-compose up --build
```

Esto levanta el contenedor con:
- Usuario no root
- Sistema de archivos de solo lectura
- `tmpfs` para `/tmp` y `/run`
- `cap_drop: ALL` y `no-new-privileges: true`

> **Traefik** actúa como proxy inverso y maneja TLS. Asegúrate de exponer el servicio en el puerto interno `8000` del contenedor.

---

## 🧩 Endpoints actuales
- `GET /` → HTML: *Hello World*
- `GET /user` → JSON con datos de ejemplo
- `GET /hello?name=tu_nombre` → HTML con saludo personalizado
- `GET /health` → Estado del servidor (`ok`)
- `WS /ws/offer` → Canal WebSocket (eco + mensajes automáticos)

---

## 📦 Variables de entorno

| Variable      | Descripción                                           | Ejemplo                                                   |
|---------------|-------------------------------------------------------|-----------------------------------------------------------|
| `CORS_ORIGIN` | Lista de orígenes permitidos (separados por coma)     | `https://www.leonobitech.com,https://app.leonobitech.com` |

En **producción** esta variable se define en el contenedor (Compose/Systemd).  
En **local** puedes exportarla antes de ejecutar el binario.

---

## 📡 Flujo actual de WebSocket
```
+-------------------+      WSS/WS        +--------------------+
|   Cliente Web     | <----------------> |  Servidor Leonobit |
| (HTML/Browser)    |     /ws/offer      | (Axum + WebSocket) |
+-------------------+                    +--------------------+
```

---

## 🔜 Roadmap
- [ ] Usar el canal WebSocket como señalización WebRTC (SDP/ICE)
- [ ] Integración con crate `webrtc` (Pion) para `offer/answer` reales
- [ ] Añadir STUN/TURN
- [ ] Autenticación y control de sesiones
- [ ] Streaming de audio/video en tiempo real
- [ ] Integración con frontend WebRTC

---

## 🛡️ Seguridad del contenedor
La configuración de Docker aplica:
- Usuario no root (`10001:10001`)
- Filesystem de solo lectura
- `tmpfs` para `/tmp` y `/run`
- Eliminación de todas las Linux capabilities (`cap_drop: ALL`)
- `no-new-privileges: true`

---

> **Nota:** Este README es preliminar y se actualizará a medida que avance el módulo de WebRTC (señalización SDP + media).

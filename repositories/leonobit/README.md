# Leonobit WebRTC Server

Este proyecto es una instancia inicial en **Rust** usando [Axum](https://github.com/tokio-rs/axum), lista para evolucionar hacia un servidor WebRTC de baja latencia.

Actualmente incluye:
- Servidor HTTP con Axum
- Endpoints de ejemplo (`/`, `/user`, `/hello`, `/health`)
- Configuración de **CORS** a través de `tower-http`
- Contenedor Docker seguro con Traefik como proxy inverso

## 📂 Estructura del proyecto

```
src/
├── config/
│   ├── cors.rs
│   └── mod.rs
├── routes/
│   ├── mod.rs
│   ├── hello_routes.rs
│   └── webrtc_routes.rs
├── lib.rs
└── main.rs
Cargo.toml
Dockerfile
docker-compose.yml
```

## 🚀 Ejecución local

### Requisitos previos
- [Rust](https://www.rust-lang.org/) (1.80+ recomendado)
- [Cargo](https://doc.rust-lang.org/cargo/)
- [Docker](https://www.docker.com/)

### Ejecutar directamente en local
```bash
cargo run
```
Servidor disponible en: [http://localhost:8000](http://localhost:8000)

### Construir y correr con Docker
```bash
docker-compose up --build
```
Esto levantará el contenedor con la configuración de seguridad incluida y Traefik como proxy.

## 🧩 Endpoints actuales
- `GET /` → HTML: "Hello World"
- `GET /user` → JSON con datos de ejemplo
- `GET /hello?name=tu_nombre` → HTML con saludo personalizado
- `GET /health` → Estado del servidor (`ok`)

## 📦 Variables de entorno
- `CORS_ORIGIN` → Lista de orígenes permitidos para CORS (separados por coma).  
  Ejemplo:
  ```env
  CORS_ORIGIN=https://www.leonobitech.com,https://app.leonobitech.com
  ```

## 🔜 Roadmap
- [ ] Implementar servidor de señalización WebRTC
- [ ] Integrar STUN/TURN
- [ ] Añadir autenticación y gestión de sesiones
- [ ] Soporte para streaming de audio/video en tiempo real
- [ ] Integración con cliente frontend WebRTC

## 🛡️ Seguridad del contenedor
La configuración de Docker aplica:
- Usuario no root (`10001:10001`)
- Filesystem de solo lectura
- `tmpfs` para `/tmp` y `/run`
- Eliminación de todas las Linux capabilities (`cap_drop: ALL`)
- `no-new-privileges: true`

---

## 📡 Diagrama preliminar del flujo WebRTC

```
+-------------------+         HTTPS/WSS          +-------------------+
|   Cliente Web     |  <--------------------->  |  Servidor Leonobit |
| (Navegador/APP)   |     Señalización Axum      | (Axum + WebRTC)    |
+---------+---------+                           +---------+---------+
          |                                              |
          |                                              |
          |             Conexión P2P WebRTC              |
          | (SDP Offer/Answer + ICE Candidates vía Axum) |
          v                                              v
   +------+------ +
   |  STUN/TURN  |   <--- UDP/TCP --->
   |   Servidor  |
   +-------------+
```

Este diagrama muestra la arquitectura prevista:
1. **Señalización** entre cliente y servidor Axum vía HTTPS/WSS.
2. **Intercambio de SDP/ICE** para establecer la conexión WebRTC.
3. **STUN/TURN** para resolver NATs y asegurar conectividad.
4. Comunicación directa P2P para audio, video y datos.

---

> **Nota**: Este README es preliminar y se actualizará a medida que avance el desarrollo del módulo WebRTC.

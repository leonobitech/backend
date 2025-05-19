
# 🚀 Sistema de Deploy Automatizado – Leonobitech

Este documento describe cómo funciona el sistema de **deploy automático** de la plataforma Leonobitech. El proceso está pensado para entornos de producción o staging y garantiza:

- Actualización inmediata del microservicio `core` tras cada `git push`
- Actualización automática de la imagen `n8n` (`latest`)
- Limpieza de imágenes obsoletas para evitar acumulación
- Registro de logs y envío de resumen por email

---

## 📁 Ubicación del script

El script principal de deploy se encuentra en:

```
/home/len/scripts/deploy.sh
```

Este archivo es ejecutado automáticamente por GitHub Actions cada vez que se realiza un `git push` a la rama `main`.

---

## ⚙️ ¿Cómo funciona?

### 1. GitHub Actions (`deploy.yml`)

- Detecta un `push` a `main`
- Se conecta por SSH al VPS como `ci`, y luego a `len`
- Ejecuta el script:  
  ```bash
  bash /home/len/scripts/deploy.sh
  ```

### 2. El script `deploy.sh` realiza:

| Paso                   |                         Acción                                   |
|------------------------|------------------------------------------------------------------|
| 🔒 Seguridad           | Habilita `set -euo pipefail` para abortar en errores silenciosos |
| 📂 Contexto            | Cambia al directorio del proyecto                                |
| 📥 Pull                | Hace `git pull` del repositorio Leonobitech                      |
| 🛠️ Rebuild `core`      | Reconstruye imagen del microservicio `core` usando `build:`      |
| 🚀 Update `core`       | Recrea el contenedor `core` con la nueva imagen                  |
| 📦 Pull `n8n`          | Descarga la última imagen `n8nio/n8n:latest` desde Docker Hub    |
| ♻️ Recreate `n8n`      | Usa nueva imagen en `n8n_main`, `n8n_webhook_1`, `n8n_worker_1`  |
| 🧼 Cleanup             | Elimina imágenes y contenedores no utilizados (`prune -a`)       |
| 📊 Espacio en disco    | Muestra uso de disco antes y después                             |
| ✉️ Email               | Envía un resumen del deploy a `admin@leonobitech.com`            |
| 🧽 Log rotation        | Borra logs temporales de más de 3 días                           |

---

## ✨ Detalles técnicos importantes

- La imagen `core` **siempre se reconstruye** desde el Dockerfile local.
- Las imágenes de `n8n` **se actualizan solo si hay una nueva versión en Docker Hub**.
- El comando `docker image prune -a -f` garantiza que no se acumulen imágenes viejas de `latest`.
- Todos los logs del proceso se almacenan temporalmente en `/tmp/deploy-*.log`.

---

## 📬 Requisitos para envío de email

Asegurarse de tener instalado `mailx` o un agente como `ssmtp` o `msmtp`.

```bash
sudo apt install mailutils
```

Y que el sistema esté configurado para enviar mails salientes desde el VPS.

---

## 🛠️ Ejecución manual (opcional)

Podés ejecutar el script manualmente desde el VPS en cualquier momento con:

```bash
bash /home/len/scripts/deploy.sh
```

Esto es útil si querés forzar una actualización sin hacer `git push`.

---

## ✅ Resultado

Este sistema garantiza un flujo **CI/CD automatizado, limpio, seguro y eficiente**, manteniendo el entorno actualizado con el mínimo esfuerzo y máxima trazabilidad.

---

## 👥 Maintained by

**Leonobitech DevOps Team** ✨  
[https://www.leonobitech.com](https://www.leonobitech.com)

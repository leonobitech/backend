# 🛡️ Seguridad y Monitoreo del VPS – Leonobitech

Este documento describe las medidas de **seguridad activa** y **auditoría automatizada** aplicadas al VPS de Leonobitech. El objetivo es garantizar el acceso seguro, trazabilidad de sesiones, defensa contra ataques y monitoreo constante.

---

## 🔐 Seguridad SSH

- Puerto custom: `2222`
- Solo IPv4 (`AddressFamily inet`)
- Clave pública obligatoria (`PasswordAuthentication no`)
- Autenticación de dos factores (2FA) con [Google Authenticator](https://github.com/google/google-authenticator-libpam):
  - Requiere: **clave pública + contraseña + código OTP**
- Acceso root deshabilitado (`PermitRootLogin no`)
- Máximo 3 intentos de autenticación (`MaxAuthTries 3`)

## 🛡️ Fail2Ban

- Protege el servicio `sshd`
- Monitorea `/var/log/auth.log`
- Banea automáticamente IPs con múltiples intentos fallidos
- Estado actual:
  ```bash
  sudo systemctl status fail2ban
  sudo fail2ban-client status sshd
  ```

## 🔥 UFW – Firewall

- Estado: activo (`ufw status`)
- Reglas:
  ```bash
  2222/tcp      ALLOW IN   Anywhere       # SSH
  80/tcp        ALLOW IN   Anywhere       # HTTP
  443/tcp       ALLOW IN   Anywhere       # HTTPS
  ```


## 🛡️ Bloquear IP en el firewall (UFW) para todo el servidor
```bash
sudo ufw deny from 193.32.162.184

```

## 🔥 Revisar si la IP quedo Bloqueada
```bash
sudo ufw status | grep 193.32.162.184

```

## 🛡️Bloquear en el servicio SSH (Fail2Ban)
```bash
sudo fail2ban-client set sshd banip 193.32.162.184

```
## 🔥 Revisar si la IP quedo Bloqueada en Fail2Ban (Temporal con bantime = 10min )
```bash
ssudo fail2ban-client status sshd

```

## 📋 Script de Auditoría `vps-monitor`

Monitorea:

- Estado de Fail2Ban
- Inicios de sesión exitosos
- Intentos fallidos más comunes
- Estado del Firewall
- Procesos que más consumen RAM

Ubicación: `/usr/local/bin/vps-monitor`

Ejecutar manualmente:
```bash
sudo vps-monitor
```

## 📬 Envío Automático por Correo

Archivo: `/usr/local/bin/vps-monitor-mail`  
Este script ejecuta la auditoría y la envía por email a `admin@leonobitech.com`.

Ver log:
```bash
sudo tail -n 50 /var/log/mail.log
```

---

## ⏱️ Tareas prgramadas en crontab (sudo crontab -e)
```bash
0 13 * * * /usr/local/bin/vps-monitor-mail
```

### 📧 vps-monitor-mail y 📋 logger vps-monitor (diariamente a las 8AM de Argentina)
```bash
# Ejecuta y guarda el log diario
REPORTE=$(/usr/local/bin/vps-monitor | tee -a /var/log/vps-monitor.log)

# 📧 Envia reporte por email (diariamente a las 8AM de Argentina)
echo "$REPORTE" | mail -a "Content-Type: text/plain; charset=UTF-8" -s "📋 Reporte de Seguridad VPS $(date +%F)" admin@leonobitech.com
```

- Probar envío de reporte diario:
  ```bash
  sudo /usr/local/bin/vps-monitor | mail -s "📋 Reporte de Seguridad VPS $(date +%F)" admin@leonobitech.com
  ```

---

## 🧪 Comandos de prueba

- Probar envío de email:
  ```bash
  echo "Correo de prueba desde el VPS de Leonobitech" | mail -s "📬 Test" admin@leonobitech.com
  ```

- Ver últimos envíos:
  ```bash
  sudo tail -n 50 /var/log/mail.log
  ```

---

## 📁 Archivos principales del sistema de seguridad

- `/usr/local/bin/vps-monitor` → Script principal de auditoría
- `/usr/local/bin/vps-monitor-mail` → Script de envío por correo
- `/var/log/vps-monitor.log` → Log local de los reportes
- `/etc/crontab` o `crontab -e` → Tareas programadas
- `/var/log/mail.log` → Log del sistema de correo

---

## 📊 Seguridad de Logs del VPS

- Los logs de auditoría diaria generados por `/usr/local/bin/vps-monitor` se almacenan en `/var/log/vps-monitor.log`.
- Se rota automáticamente todos los días usando `logrotate`, conservando 14 días de historial comprimido.
- Configuración en: `/etc/logrotate.d/vps-monitor`
- Permisos: `root:adm` (chmod 640) con directiva `su` para máxima seguridad.

---

## 🛠️ Archivos de configuración editados

- `/etc/ssh/sshd_config` → Configuración SSH
  - `Match User ci`: solo permite clave pública, sin TTY ni comandos
  - `Match User len Address 127.0.0.1,::1`: ejecuta directamente `deploy.sh` al recibir conexión local desde `ci`
- `/etc/pam.d/sshd` → Integración con Google Authenticator (2FA)
- `/etc/postfix/main.cf` → Configuración del servidor de correo
- `/etc/aliases` (opcional) → Alias de correo
- `~/.google_authenticator` → Archivo generado por Google Authenticator para el usuario

---

## 🍪 Doble Capa Anti-Tracking (Traefik + Express)

Leonobitech implementa una **estrategia defensiva en dos niveles** para evitar cookies de rastreo (como GA, RudderStack, PostHog, Intercom, etc.) que comprometan la privacidad de los usuarios o interfieran con el sistema de autenticación.

### 🧱 Nivel 1 – Proxy Traefik (Prevención)

A través del middleware `block-trackers@docker`, Traefik aplica una **Content Security Policy (CSP)** restrictiva a los servicios expuestos:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
```

También agrega un header de rastreo:

```http
X-Blocked-By: Traefik
```

### 🔍 Nivel 2 – Backend Express (Detección y bloqueo activo)

El servicio `core` usa el middleware `monitorCookies.ts` para analizar todas las cookies entrantes. Si se detecta alguna con prefijos sospechosos (como `_ga`, `ajs_`, `ph_`, etc.), la petición se bloquea con `403 Forbidden` y se registra el evento.

```json
{
  "status": "error",
  "message": "Se detectaron cookies no autorizadas. Limpiá tu navegador y volvé a intentar.",
  "cookies": ["_ga", "ajs_user_id"]
}
```

✅ Esto garantiza que **solo cookies legítimas como `accessKey` y `clientKey`** atraviesen hasta el backend.

---

## ✅ Estado actual verificado

- [x] Protección SSH funcionando con OTP
- [x] Fail2Ban operativo
- [x] Firewall UFW activo
- [x] Envío de emails exitoso (con emojis)
- [x] Cron jobs activos y verificados
- [x] Traefik y Express filtrando cookies sospechosas

---

> 🧬 VPS defendido por Leonobitech. Modo ninja activado ⚔️

## ✨ Maintained by

**Leonobitech Dev Team**  
https://www.leonobitech.com  
Made with 🧠, 🥷, and Docker love 🐳
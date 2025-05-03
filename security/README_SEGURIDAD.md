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

## ⏱️ Tareas Cron

### 📝 Guardar en log local (diariamente a las 2AM)
```bash
0 2 * * * /usr/local/bin/vps-monitor | tee -a /var/log/vps-monitor.log
```

### 📧 Enviar por email (diariamente a las 6AM)
```bash
0 6 * * * /usr/local/bin/vps-monitor-mail
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

## 🛠️ Archivos de configuración editados

- `/etc/ssh/sshd_config` → Configuración SSH
- `/etc/pam.d/sshd` → Integración con Google Authenticator
- `/etc/postfix/main.cf` → Configuración del servidor de correo
- `/etc/aliases` (opcional) → Alias de correo
- `~/.google_authenticator` → Archivo generado por Google Authenticator para el usuario

---

## ✅ Estado actual verificado

- [x] Protección SSH funcionando
- [x] Fail2Ban operativo
- [x] Firewall UFW activo
- [x] Envío de emails exitoso (incluye emojis)
- [x] Cron jobs activos y verificados

---

## 🧠 Recomendaciones futuras

- Integrar los logs con una solución tipo Loki + Grafana
- Redirigir logs críticos a un bucket S3 o sistema externo
- Instalar sistema de detección de intrusos (`aide`, `rkhunter`, etc.)

---

> 🧬 VPS defendido por Leonobitech. Modo ninja activado ⚔️
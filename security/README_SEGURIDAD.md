
# 🛡️ Seguridad y Monitoreo del VPS – Leonobitech

Este documento describe las medidas de **seguridad activa**, **auditoría automatizada** y **configuración del correo saliente** aplicadas al VPS de Leonobitech. El objetivo es garantizar el acceso seguro, trazabilidad de sesiones, defensa contra ataques y monitoreo constante.

---

## 🔐 Seguridad SSH

- Puerto custom: `2222`
- Solo IPv4 (`AddressFamily inet`)
- Clave pública obligatoria (`PasswordAuthentication no`)
- Autenticación de dos factores (2FA) con [Google Authenticator](https://github.com/google/google-authenticator-libpam):
  - Requiere: **clave pública + contraseña + código OTP**
- Acceso root deshabilitado (`PermitRootLogin no`)
- Máximo 3 intentos de autenticación (`MaxAuthTries 3`)

---

## 🛡️ Fail2Ban

- Protege el servicio `sshd`
- Monitorea `/var/log/auth.log`
- Banea automáticamente IPs con múltiples intentos fallidos

Ver estado:
```bash
sudo systemctl status fail2ban
sudo fail2ban-client status sshd
```

---

## 🔥 UFW – Firewall

Estado:
```bash
sudo ufw status verbose
```

Reglas típicas:
```bash
2222/tcp      ALLOW IN   Anywhere       # SSH
80/tcp        ALLOW IN   Anywhere       # HTTP
443/tcp       ALLOW IN   Anywhere       # HTTPS
```

---

## 🚫 Bloquear IP manualmente

En el firewall:
```bash
sudo ufw deny from 193.32.162.184
sudo ufw status | grep 193.32.162.184
```

En Fail2Ban (temporal):
```bash
sudo fail2ban-client set sshd banip 193.32.162.184
sudo fail2ban-client status sshd
```

---

## 📋 Script de Auditoría `vps-monitor`

Ubicación: `/usr/local/bin/vps-monitor`

Monitorea:

- Estado de Fail2Ban
- Inicios de sesión exitosos
- IPs baneadas recientes
- Estado del Firewall UFW
- Procesos con más uso de RAM y CPU
- Anomalías (procesos desde rutas sospechosas)
- Espacio en disco

Ejecutar manualmente:
```bash
sudo /usr/local/bin/vps-monitor
```

---

## 📬 Envío Automático por Correo

Script: `/usr/local/bin/vps-monitor-mail`

Contenido:
```bash
#!/bin/bash

REPORTE=$(/usr/local/bin/vps-monitor | tee -a /var/log/msmtp-root.log)

echo "$REPORTE" | msmtp --from=default -t <<EOF
To: leonobitech@gmail.com
From: Reporte | VPS <felix@leonobitech.com>
Subject: 📋 Reporte de Seguridad VPS $(date +%F)

$REPORTE
EOF
```

---

## 🕐 Cron Job Diario

Agregado vía:
```bash
sudo crontab -e
```

Contenido:
```cron
# 🕕 08:00 AM Argentina – Enviar reporte de seguridad por email
0 13 * * * /usr/local/bin/vps-monitor-mail
```

---

## 📁 Archivos principales

| Archivo                             | Descripción                                      |
|-------------------------------------|--------------------------------------------------|
| `/usr/local/bin/vps-monitor`        | Script principal de auditoría                    |
| `/usr/local/bin/vps-monitor-mail`   | Script para envío de email                       |
| `/var/log/msmtp-root.log`           | Log de ejecución + log de msmtp                 |
| `/etc/msmtprc`                      | Configuración de SMTP con Zoho                   |

---

## 📧 Configuración del correo con `msmtp` (Zoho)

Instalación:
```bash
sudo apt install msmtp msmtp-mta
```

Archivo de configuración global:
```ini
# /etc/msmtprc
defaults
auth on
tls on
tls_starttls on
tls_trust_file /etc/ssl/certs/ca-certificates.crt
logfile /var/log/msmtp-root.log

account default
host smtp.zoho.com
port 587
from user@domain.com
user user@domain.com
password ***************
```

Permisos seguros:
```bash
sudo chmod 600 /etc/msmtprc
sudo chown root:root /etc/msmtprc
```

---

## 🧪 Pruebas y Debug

Prueba de envío:
```bash
echo "Hola mundo" | msmtp --debug --from=default -t leonobitech@gmail.com
```

Ver últimos logs:
```bash
sudo tail -n 50 /var/log/msmtp-root.log
```

---

> 🧬 VPS defendido por Leonobitech. Modo ninja activado ⚔️

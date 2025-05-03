# 🛡️ Guía PRO para Configurar Usuario CI en VPS con Deploy via GitHub Actions

Este documento describe cómo crear un usuario seguro (`ci`) en tu VPS para automatizar despliegues de producción mediante GitHub Actions y SSH, usando claves modernas `ed25519`.

---

## 📦 Paso 1: Crear usuario `ci`

```bash
sudo adduser ci
sudo usermod -aG sudo ci
```

---

## 🔐 Paso 2: Generar clave SSH (ed25519)

**En tu máquina local (NO en el VPS):**

```bash
ssh-keygen -t ed25519 -C "ci@github-actions"
```

Guarda la clave como `~/.ssh/id_ed25519_ci` y **no** uses passphrase.

---

## 🔑 Paso 3: Copiar la clave pública al VPS

```bash
ssh-copy-id -i ~/.ssh/id_ed25519_ci.pub -p 2222 ci@IP_DEL_VPS
```

O manualmente:

```bash
cat ~/.ssh/id_ed25519_ci.pub
```

Luego, en el VPS:

```bash
mkdir -p /home/ci/.ssh
nano /home/ci/.ssh/authorized_keys
# Pega la clave pública aquí
chmod 600 /home/ci/.ssh/authorized_keys
chown -R ci:ci /home/ci/.ssh
```

---

## 🔐 Paso 4: Asegurar el acceso SSH del usuario

Edita `/etc/ssh/sshd_config`:

```bash
# Asegura que estos valores estén presentes:
Port 2222
PermitRootLogin no
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM yes
AuthenticationMethods publickey
```

Reinicia el servicio:

```bash
sudo systemctl restart ssh
```

---

## 🧪 Paso 5: Verificar conexión SSH

Desde tu máquina local:

```bash
ssh -p 2222 -i ~/.ssh/id_ed25519_ci ci@IP_DEL_VPS
```

---

## 🤖 Paso 6: Agregar secrets a GitHub

Ve a tu repositorio > Settings > Secrets and variables > Actions y agrega:

- `VPS_USER` → `ci`
- `VPS_HOST` → IP o dominio de tu VPS
- `VPS_DEPLOY_KEY` → Contenido de `~/.ssh/id_ed25519_ci` (clave privada)

---

## 🚀 Paso 7: Agrega el workflow a `.github/workflows/deploy.yml`

```yaml
name: 🚀 Deploy to Production - Main

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: 📦 Checkout repo
        uses: actions/checkout@v3

      - name: 🔐 Setup SSH key
        uses: webfactory/ssh-agent@v0.7.0
        with:
          ssh-private-key: ${{ secrets.VPS_DEPLOY_KEY }}

      - name: 🚀 Deploy to VPS via SSH
        run: |
          ssh -p 2222 -o StrictHostKeyChecking=no ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'EOF'
            set -e
            cd ~/backend

            echo "📊 Espacio en disco antes del deploy:"
            df -h /

            echo "📦 Actualización de imágenes desde Docker Hub"
            docker compose pull

            echo "📥 Pull de cambios y rebuild personalizado"
            git pull
            docker compose up -d --build

            echo "🧼 Limpieza post-deploy de contenedores parados e imágenes huérfanas"
            docker container prune -f
            docker image prune -f

            echo "📊 Espacio en disco después del deploy:"
            df -h /

            echo "✅ Deploy completado correctamente 🚀"
          EOF
```

---

## 👥 Maintained by

**Leonobitech DevOps Team** ✨  
[https://www.leonobitech.com](https://www.leonobitech.com)

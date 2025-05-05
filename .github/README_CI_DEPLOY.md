
# 🛡️ Guía PRO para Configurar Usuario CI en VPS con Deploy via GitHub Actions

Este documento explica cómo crear un usuario CI seguro en tu VPS y configurarlo para que realice deploys automáticos desde GitHub con acceso limitado mediante llaves SSH `ed25519`.

---

## 📦 Paso 1: Crear el usuario `ci`

```bash
sudo adduser ci
```

Sigue las instrucciones para definir contraseña y otros datos. Cuando termine, desactiva el acceso interactivo:

```bash
sudo usermod -s /usr/sbin/nologin ci
```

---

## 🔐 Paso 2: Crear la clave SSH (ed25519)

Desde tu máquina local, ejecutá:

```bash
ssh-keygen -t ed25519 -C "deploy@github-actions" -f ~/.ssh/id_ed25519_ci
```

- Esto genera dos archivos:
  - `id_ed25519_ci` (clave privada)
  - `id_ed25519_ci.pub` (clave pública)

---

## 📤 Paso 3: Copiar la clave pública al VPS

```bash
ssh-copy-id -i ~/.ssh/id_ed25519_ci.pub -p 2222 ci@TU_IP_DEL_VPS
```

Asegurate que la carpeta `.ssh/authorized_keys` exista en `/home/ci/` y tenga permisos correctos:

```bash
sudo chown -R ci:ci /home/ci/.ssh
sudo chmod 700 /home/ci/.ssh
sudo chmod 600 /home/ci/.ssh/authorized_keys
```

---

## 🔒 Paso 4: Restringir permisos del usuario `ci`

Editá el archivo `sudoers`:

```bash
sudo visudo
```

Agregá esta línea al final para impedir que `ci` tenga permisos de superusuario:

```
ci ALL=(ALL) NOPASSWD: /bin/false
```

También podés agregar reglas a `sshd_config` para limitar aún más:

```bash
Match User ci
    AuthenticationMethods publickey
    AllowTcpForwarding no
    X11Forwarding no
    PermitTTY no
    ForceCommand /bin/false
```

Luego reiniciá el servicio SSH:

```bash
sudo systemctl restart ssh
```

---

## 🔁 Paso 5: Subir la clave privada a GitHub

Desde tu máquina, copiá el contenido de la clave privada:

```bash
cat ~/.ssh/id_ed25519_ci
```

En GitHub > Settings > Secrets and variables > Actions > *New Repository Secret*:

- `VPS_DEPLOY_KEY`: 🔐 la clave privada (`id_ed25519_ci`)
- `VPS_HOST`: 🖥️ tu IP o dominio del VPS
- `VPS_USER`: 👤 `ci`

---

## 🚀 Paso 6: Crear el workflow en `.github/workflows/deploy.yml`

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
            cd /home/ci/backend  # Asegúrate que exista
            git pull
            docker compose up -d --build
            docker image prune -f
          EOF
```

---

## 🧪 Probar conexión local

Desde tu máquina podés probar el login SSH sin contraseña:

```bash
ssh -p 2222 ci@TU_IP_DEL_VPS -i ~/.ssh/id_ed25519_ci
```

No debería dejarte hacer nada (ni usar shell), pero sí debería permitir el deploy vía GitHub Actions.

---

## 👥 Maintained by

**Leonobitech DevOps Team** ✨  
[https://www.leonobitech.com](https://www.leonobitech.com)

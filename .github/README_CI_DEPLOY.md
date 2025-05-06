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

✅ **Mejora aplicada:** este usuario ya está creado y operativo en producción.

---

## 🔐 Paso 2: Crear la clave SSH (ed25519)

Desde tu máquina local, ejecutá:

```bash
ssh-keygen -t ed25519 -C "deploy@github-actions" -f ~/.ssh/id_ed25519_ci
```

- Esto genera dos archivos:
  - `id_ed25519_ci` (clave privada)
  - `id_ed25519_ci.pub` (clave pública)

✅ **Ya implementado:** clave utilizada en GitHub Actions.

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

✅ **Ya está configurado:** verificado que el acceso es solo por clave pública.

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
# 🎯 Excepción para el usuario ci
Match User ci
    AuthenticationMethods publickey
    AllowTcpForwarding no
    X11Forwarding no
    PermitTTY no
    ForceCommand /bin/false
```

✅ **Ya aplicado:** el usuario `ci` no tiene shell, sudo, ni puede usar TTY. Solo sirve como puente SSH.

---

## 🔒 Seguridad avanzada para el usuario `len`

El usuario `len` es el operador principal en el VPS. Se aplicaron medidas avanzadas para proteger su acceso:

### 🧩 Bloques `Match` en `sshd_config`

```bash
# 🎯 Excepción para el usuario len SOLO si se conecta desde localhost
Match User len Address 127.0.0.1,::1
  AuthenticationMethods publickey
  ForceCommand /home/len/scripts/deploy.sh
  PermitTTY no
```

- Esto asegura que el usuario `ci` **sólo pueda conectarse internamente a `len@localhost`**, y que `len` solo pueda ejecutar el script de deploy (`deploy.sh`) sin acceso interactivo.

Además, para conexiones normales como `len@<IP>`, se requiere clave + OTP:

```bash
Match User len
    AuthenticationMethods publickey,keyboard-interactive
    PermitRootLogin no
    AllowTcpForwarding yes
    X11Forwarding no
    PrintMotd no
```

### 🔐 Autenticación de dos factores (2FA)

Se activó Google Authenticator para el usuario `len`:

```bash
google-authenticator -t -d -f -r 3 -R 30 -W
```

Y se habilitó `PAM` en `sshd_config`:

```bash
UsePAM yes
ChallengeResponseAuthentication yes
AuthenticationMethods publickey,keyboard-interactive
```

✅ **Actualmente en producción:** el acceso SSH como `len` desde fuera del VPS requiere clave privada **y** código OTP.

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

✅ **Ya configurado en el repositorio `leonobitech/backend`**

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
    timeout-minutes: 10

    steps:
      - name: 📦 Checkout repo
        uses: actions/checkout@v3

      - name: 🔐 Setup SSH key
        uses: webfactory/ssh-agent@v0.7.0
        with:
          ssh-private-key: ${{ secrets.VPS_DEPLOY_KEY }}

      - name: 🚀 Ejecutar deploy.sh via ci → len
        run: |
          echo "🟢 Conectando a VPS como usuario 'ci'..."
          ssh -p 2222 -A -o StrictHostKeyChecking=no ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'EOF'
            echo "📡 Conectando desde ci@ a len@localhost para ejecutar el script deploy.sh..."

            ssh -p 2222 \
              -o IdentitiesOnly=yes \
              -o PreferredAuthentications=publickey \
              len@localhost << 'EOC'
                echo "✅ Ejecutando deploy.sh como 'len'..."
                bash /home/len/scripts/deploy.sh
              EOC

          EOF
```

✅ **Ya funcional:** probado en producción con éxito.

---

## 🧪 Probar conexión local

Desde tu máquina podés probar el login SSH sin contraseña:

```bash
ssh -p 2222 ci@TU_IP_DEL_VPS
```

No debería dejarte hacer nada (ni usar shell), pero sí debería permitir el deploy vía GitHub Actions.

---

## 👥 Maintained by

**Leonobitech DevOps Team** ✨  
[https://www.leonobitech.com](https://www.leonobitech.com)

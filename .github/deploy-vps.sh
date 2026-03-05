#!/bin/bash
set -euo pipefail

# Moverse al directorio donde vive este script
cd "$(dirname "$0")"

# === Configuración ===
RECIPIENT="admin@leonobitech.com"
NOW=$(date '+%Y-%m-%d %H:%M')
TMP_LOG="/tmp/deploy-$(date +%Y%m%d-%H%M%S).log"
SUBJECT="🚀 Deploy completado - Leonobitech [$NOW]"

# Servicios con imágenes de DockerHub (pull latest)
EXTERNAL_SERVICES="n8n_main n8n_webhook_1 n8n_worker_1 n8n_worker_2 odoo qdrant backend baserow baserow_celery baserow_celery_export_worker baserow_celery_beat baserow_media"

# Servicios con build local (rebuild sin cache)
LOCAL_SERVICES="core odoo_mcp"

# Captura todo el output del deploy
exec > >(tee -a "$TMP_LOG") 2>&1

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 INICIO DEL DEPLOY - $NOW"
echo "📍 Usuario: $(whoami) | Host: $(hostname)"
echo "📂 Working dir: $(pwd)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Espacio antes del deploy
echo -e "\n📊 Espacio en disco ANTES del deploy:"
df -h /

# Pull del repositorio
cd /home/len/backend
echo -e "\n📥 Pull del repositorio:"
git pull origin main

# Obtener commit actual para trazabilidad
GIT_HASH=$(git rev-parse --short HEAD)
echo "📌 Commit actual: $GIT_HASH"

# ============================================================
# SERVICIOS EXTERNOS (DockerHub) - Pull + recreate si cambió
# ============================================================
echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 ACTUALIZANDO SERVICIOS EXTERNOS (DockerHub)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "\n⬇️  Pulling imágenes desde DockerHub..."
docker compose pull $EXTERNAL_SERVICES

echo -e "\n♻️  Recreando contenedores si la imagen cambió..."
docker compose up -d --no-deps $EXTERNAL_SERVICES

# ============================================================
# SERVICIOS LOCALES (Build) - Rebuild sin cache
# ============================================================
echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔨 REBUILDING SERVICIOS LOCALES (sin cache)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "\n🏗️  Build con --pull --no-cache (commit: $GIT_HASH)..."
docker compose build --pull --no-cache $LOCAL_SERVICES

echo -e "\n🚀 Recreando contenedores con el nuevo build..."
docker compose up -d --force-recreate --no-deps $LOCAL_SERVICES

# ============================================================
# TRAZABILIDAD DE IMÁGENES
# ============================================================
echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🆔 IMÁGENES ACTUALES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Función para mostrar info de imagen
show_image_info() {
    local image=$1
    local name=$2
    if docker image inspect "$image" >/dev/null 2>&1; then
        echo -e "\n$name:"
        docker inspect "$image" --format='  ID: {{.Id | printf "%.12s"}} | Creada: {{.Created}}'
    fi
}

show_image_info "n8nio/n8n:latest" "📧 n8n"
show_image_info "odoo:latest" "🏢 Odoo"
show_image_info "qdrant/qdrant:latest" "🧠 Qdrant"
show_image_info "baserow/backend:latest" "📊 Baserow Backend"
show_image_info "baserow/web-frontend:latest" "📊 Baserow Frontend"
show_image_info "leonobitech/core:v1.0.1" "⚙️  Core (local)"
show_image_info "leonobitech/leonobit:latest" "🦁 Leonobit (local)"
show_image_info "leonobitech/odoo_mcp:v2.0" "🔌 Odoo MCP (local)"

# ============================================================
# LIMPIEZA
# ============================================================
echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧹 LIMPIEZA"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "\n🗑️  Eliminando contenedores parados..."
docker container prune -f 2>/dev/null || true

echo -e "\n🗑️  Eliminando imágenes huérfanas (dangling)..."
docker image prune -f 2>/dev/null || true

echo -e "\n🗑️  Eliminando build cache antiguo..."
docker builder prune -f --filter "until=24h" 2>/dev/null || true

# Espacio después del deploy
echo -e "\n📊 Espacio en disco DESPUÉS del deploy:"
df -h /

# Verificar que los servicios están corriendo
echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ESTADO FINAL DE SERVICIOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" | head -30 || true

echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deploy finalizado correctamente - $(date)"
echo "📌 Commit: $GIT_HASH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Enviar resumen por email
if command -v mail >/dev/null 2>&1; then
    mail -s "$SUBJECT" "$RECIPIENT" < "$TMP_LOG" \
        || echo "⚠️  Error al enviar el email a $RECIPIENT"
else
    echo -e "\n⚠️  'mail' no está instalado, no se pudo enviar el resumen por correo."
fi

# Limpieza de logs viejos en /tmp
find /tmp -maxdepth 1 -type f -name "deploy-*.log" -mtime +3 -delete 2>/dev/null || true

exit 0

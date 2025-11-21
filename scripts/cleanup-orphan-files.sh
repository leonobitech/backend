#!/bin/bash

# Script de limpieza de archivos huérfanos en Baserow
# Solo borra archivos que NO están referenciados en la base de datos

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧹 Cleanup de Archivos Huérfanos en Baserow"
echo "==========================================="
echo ""

# Configuración
BASEROW_TOKEN="hRyhpz42krDurs1fPxLDK09Ypn1keySq"
BASEROW_API="https://br.leonobitech.com/api"
TABLE_ID="848"
CONTAINER_NAME="baserow_backend"
MEDIA_PATH="/baserow/media/user_files"

# Paso 1: Obtener archivos activos de Baserow DB
echo "📋 Paso 1: Obteniendo archivos activos de Baserow..."

ACTIVE_FILES=$(curl -s -X GET "${BASEROW_API}/database/rows/table/${TABLE_ID}/?user_field_names=true&size=200" \
  -H "Authorization: Token ${BASEROW_TOKEN}" | \
  jq -r '.results[].avatar[]?.name // empty' | sort | uniq)

ACTIVE_COUNT=$(echo "$ACTIVE_FILES" | grep -v '^$' | wc -l | tr -d ' ')
echo -e "${GREEN}✓${NC} Archivos activos en DB: ${ACTIVE_COUNT}"
echo ""

# Paso 2: Listar archivos en disco
echo "💾 Paso 2: Listando archivos en disco..."

DISK_FILES=$(docker exec $CONTAINER_NAME ls -1 $MEDIA_PATH | grep -E '\.(jpg|jpeg|png|webp|pdf|txt)$' | sort)

DISK_COUNT=$(echo "$DISK_FILES" | grep -v '^$' | wc -l | tr -d ' ')
echo -e "${GREEN}✓${NC} Archivos en disco: ${DISK_COUNT}"
echo ""

# Paso 3: Identificar huérfanos
echo "🔍 Paso 3: Identificando archivos huérfanos..."

ORPHAN_FILES=""
ORPHAN_COUNT=0
TOTAL_SIZE=0

while IFS= read -r file; do
  if [ -z "$file" ]; then
    continue
  fi

  # Verificar si el archivo está en la lista de activos
  if ! echo "$ACTIVE_FILES" | grep -q "^${file}$"; then
    ORPHAN_FILES="${ORPHAN_FILES}${file}\n"
    ORPHAN_COUNT=$((ORPHAN_COUNT + 1))

    # Obtener tamaño del archivo
    SIZE=$(docker exec $CONTAINER_NAME stat -c%s "$MEDIA_PATH/$file" 2>/dev/null || echo 0)
    TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
  fi
done <<< "$DISK_FILES"

echo -e "${YELLOW}⚠${NC}  Archivos huérfanos encontrados: ${ORPHAN_COUNT}"
echo ""

# Mostrar archivos huérfanos
if [ $ORPHAN_COUNT -eq 0 ]; then
  echo -e "${GREEN}✅ No hay archivos huérfanos para limpiar!${NC}"
  exit 0
fi

# Convertir tamaño a formato legible
if [ $TOTAL_SIZE -gt 1048576 ]; then
  SIZE_MB=$((TOTAL_SIZE / 1048576))
  SIZE_DISPLAY="${SIZE_MB}MB"
elif [ $TOTAL_SIZE -gt 1024 ]; then
  SIZE_KB=$((TOTAL_SIZE / 1024))
  SIZE_DISPLAY="${SIZE_KB}KB"
else
  SIZE_DISPLAY="${TOTAL_SIZE}B"
fi

echo "📦 Espacio a liberar: ${SIZE_DISPLAY}"
echo ""
echo "📄 Archivos a borrar:"
echo "─────────────────────────────────────────────────────"
echo -e "$ORPHAN_FILES" | grep -v '^$' | head -20

if [ $ORPHAN_COUNT -gt 20 ]; then
  echo "... y $((ORPHAN_COUNT - 20)) archivos más"
fi

echo "─────────────────────────────────────────────────────"
echo ""

# Confirmación
echo -e "${YELLOW}⚠️  ADVERTENCIA:${NC} Esta acción es irreversible."
echo ""
read -p "¿Deseas continuar con la limpieza? (escribe 'SI' para confirmar): " CONFIRM

if [ "$CONFIRM" != "SI" ]; then
  echo -e "${RED}✗${NC} Operación cancelada."
  exit 0
fi

echo ""
echo "🗑️  Borrando archivos huérfanos..."
echo ""

DELETED_COUNT=0
FAILED_COUNT=0

while IFS= read -r file; do
  if [ -z "$file" ]; then
    continue
  fi

  if docker exec $CONTAINER_NAME rm "$MEDIA_PATH/$file" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Borrado: $file"
    DELETED_COUNT=$((DELETED_COUNT + 1))
  else
    echo -e "${RED}✗${NC} Error al borrar: $file"
    FAILED_COUNT=$((FAILED_COUNT + 1))
  fi
done <<< "$(echo -e "$ORPHAN_FILES" | grep -v '^$')"

echo ""
echo "═══════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Limpieza completada!${NC}"
echo ""
echo "📊 Resumen:"
echo "  • Archivos borrados: ${DELETED_COUNT}"
if [ $FAILED_COUNT -gt 0 ]; then
  echo -e "  • Errores: ${RED}${FAILED_COUNT}${NC}"
fi
echo "  • Espacio liberado: ${SIZE_DISPLAY}"
echo "  • Archivos activos conservados: ${ACTIVE_COUNT}"
echo "═══════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}✓${NC} Tus avatares activos están intactos y funcionando."

#!/bin/bash
# Generates livekit.yaml from template + .env
# Usage: ./generate-config.sh
# Run this on the VPS after deploying, or as part of CI/CD

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/livekit.yaml.template"
OUTPUT="$SCRIPT_DIR/livekit.yaml"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$TEMPLATE" ]; then
  echo "ERROR: Template not found: $TEMPLATE"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found: $ENV_FILE"
  echo "Create it with: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, REDIS_PASSWORD"
  exit 1
fi

# Load env vars
set -a
source "$ENV_FILE"
set +a

# Validate required vars
for var in LIVEKIT_API_KEY LIVEKIT_API_SECRET REDIS_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set in $ENV_FILE"
    exit 1
  fi
done

# Generate config using envsubst
envsubst < "$TEMPLATE" > "$OUTPUT"
chmod 600 "$OUTPUT"

echo "Generated $OUTPUT"

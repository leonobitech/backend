#!/bin/bash
# Download Piper TTS model: es_AR-daniela-high (Spanish Argentina, female)
# Run this script to download the model files before building the Docker image

set -e

MODEL_DIR="./models"
MODEL_NAME="es_AR-daniela-high"
BASE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high"

mkdir -p "$MODEL_DIR"

echo "Downloading Piper model: $MODEL_NAME"
echo "This may take a few minutes (~114MB)..."

# Download ONNX model (~114MB)
if [ ! -f "$MODEL_DIR/${MODEL_NAME}.onnx" ]; then
    echo "Downloading ${MODEL_NAME}.onnx..."
    curl -L -o "$MODEL_DIR/${MODEL_NAME}.onnx" \
        "${BASE_URL}/${MODEL_NAME}.onnx"
else
    echo "${MODEL_NAME}.onnx already exists, skipping..."
fi

# Download model config
if [ ! -f "$MODEL_DIR/${MODEL_NAME}.onnx.json" ]; then
    echo "Downloading ${MODEL_NAME}.onnx.json..."
    curl -L -o "$MODEL_DIR/${MODEL_NAME}.onnx.json" \
        "${BASE_URL}/${MODEL_NAME}.onnx.json"
else
    echo "${MODEL_NAME}.onnx.json already exists, skipping..."
fi

echo ""
echo "Model downloaded successfully!"
echo "Files:"
ls -lh "$MODEL_DIR"

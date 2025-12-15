# Piper TTS Server

Servidor de Text-to-Speech usando [Piper](https://github.com/rhasspy/piper) con voz en español argentino.

## Voz

- **Modelo**: `es_AR-daniela-high`
- **Idioma**: Español (Argentina)
- **Género**: Femenino
- **Calidad**: Alta (22050 Hz, 16-bit)
- **Tamaño**: ~114MB

## API Endpoints

### Health Check

```bash
GET http://piper_tts:5000/health
```

Respuesta:
```json
{
  "status": "ok",
  "model_loaded": true,
  "model_name": "es_AR-daniela-high"
}
```

### Text to Speech

```bash
POST http://piper_tts:5000/tts
Content-Type: application/json

{
  "text": "Hola, ¿cómo estás?",
  "output_format": "wav",
  "length_scale": 1.0,
  "noise_scale": 0.667,
  "noise_w": 0.8
}
```

**Parámetros**:
| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `text` | string | *requerido* | Texto a convertir (max 5000 chars) |
| `output_format` | "wav" \| "opus" | "wav" | Formato de audio de salida |
| `length_scale` | float | 1.0 | Velocidad del habla (0.5-2.0) |
| `noise_scale` | float | 0.667 | Variación de fonemas (0-1) |
| `noise_w` | float | 0.8 | Variación de duración (0-1) |

**Respuesta**: Audio binario (WAV o OGG/Opus)

## Uso desde n8n

### HTTP Request Node

1. Crear un nodo **HTTP Request**
2. Configurar:
   - **Method**: POST
   - **URL**: `http://piper_tts:5000/tts`
   - **Body Content Type**: JSON
   - **Body**:
     ```json
     {
       "text": "{{ $json.mensaje }}",
       "output_format": "wav"
     }
     ```
   - **Response Format**: File

### Uso para WhatsApp (Chatwoot)

Para enviar mensajes de voz a WhatsApp, usar `output_format: "opus"`:

```json
{
  "text": "Hola, gracias por contactarnos.",
  "output_format": "opus"
}
```

El servidor genera OGG/Opus optimizado para WhatsApp:
- 48kHz sample rate
- 32kbps bitrate
- Mono, modo VoIP

**Flujo típico n8n → Chatwoot:**
1. Recibir mensaje de WhatsApp (webhook Chatwoot)
2. Generar respuesta con AI
3. Convertir a audio con Piper TTS (`output_format: "opus"`)
4. Enviar como mensaje de voz via API Chatwoot

### Ejemplo de workflow n8n

```json
{
  "nodes": [
    {
      "name": "TTS Request",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "http://piper_tts:5000/tts",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "text",
              "value": "={{ $json.text }}"
            },
            {
              "name": "output_format",
              "value": "wav"
            }
          ]
        },
        "options": {
          "response": {
            "response": {
              "responseFormat": "file"
            }
          }
        }
      }
    }
  ]
}
```

## Despliegue

El servicio se despliega junto con el stack principal:

```bash
cd backend
docker compose up -d piper_tts
```

### Build manual

```bash
docker compose build piper_tts
```

### Ver logs

```bash
docker logs -f piper_tts
```

## Arquitectura

```
n8n (leonobitech-net)
    │
    ▼
piper_tts:5000 (interno, no expuesto a internet)
    │
    ├── FastAPI server (uvicorn)
    ├── Piper binary (CPU inference)
    └── es_AR-davefx-high.onnx model
```

## Recursos

- CPU: hasta 2 cores
- RAM: hasta 1GB
- Sin GPU requerida

## Troubleshooting

### Error: Model not loaded

El modelo se descarga durante el build del Docker. Si falla:

```bash
docker compose build --no-cache piper_tts
```

### Audio muy lento/rápido

Ajustar `length_scale`:
- `0.8` = más rápido
- `1.0` = normal
- `1.2` = más lento

### Calidad de audio

Para mejor calidad, usar `output_format: "wav"`. Opus comprime y puede perder calidad.

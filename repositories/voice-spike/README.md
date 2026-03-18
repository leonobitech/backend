# Voice Spike - Conversación en Tiempo Real con IA

Proof of concept de comunicación por voz en tiempo real: **Habla → STT → LLM → TTS → Escucha**.

## Stack

| Componente | Tecnología | Rol |
|-----------|-----------|-----|
| **STT** | faster-whisper (modelo `small`) | Speech-to-Text local |
| **LLM** | Claude Haiku 4.5 (API) | Genera respuestas |
| **TTS** | Piper TTS (`es_AR-daniela-high`) | Text-to-Speech local |
| **Backend** | FastAPI + WebSocket | Orquesta el pipeline |
| **Frontend** | HTML + AudioWorklet + WebSocket | Captura mic y reproduce audio |

## Arquitectura

```
Browser (micrófono)
    ↓ WebSocket (audio chunks int16 PCM)
FastAPI Server
    ↓ Resample 48kHz → 16kHz
    ↓ VAD (energy-based, 200 threshold)
    ↓ Silencio 800ms → segmento completo
faster-whisper (STT)
    ↓ texto transcrito
Claude Haiku 4.5 (LLM)
    ↓ respuesta texto
Piper TTS (genera WAV)
    ↓ audio bytes via WebSocket
Browser (reproduce audio)
```

## Funcionalidades

- **Transcripción parcial**: texto en gris mientras hablas (beam_size=1, fire-and-forget)
- **Transcripción final**: texto consolidado cuando haces pausa (VAD + vad_filter)
- **Filtro de alucinaciones**: ignora "suscríbete", "gracias por ver", etc. (Whisper trained on YouTube)
- **Conversación con contexto**: historial de mensajes se mantiene durante la sesión
- **Retry en LLM**: 3 intentos con fallback si la API falla

## Setup

```bash
cd backend/repositories/voice-spike

# Virtual environment
python3 -m venv venv
source venv/bin/activate

# Dependencias
pip install -r requirements.txt
pip install requests pathvalidate anthropic python-dotenv piper-tts

# Modelo Piper (voz española argentina)
mkdir -p models
cd models
curl -L -o es_AR-daniela-high.onnx "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx"
curl -L -o es_AR-daniela-high.onnx.json "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx.json"
cd ..

# API Key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Correr
uvicorn server:app --host 0.0.0.0 --port 8200
```

Abrir **http://localhost:8200** en el browser.

## Archivos

```
voice-spike/
├── server.py              # FastAPI + WebSocket + Whisper + Claude + Piper
├── requirements.txt       # Dependencias base
├── .env                   # API key (no commitear)
├── .gitignore             # Excluye .env, venv/, models/
├── static/
│   ├── index.html         # UI (botón llamada + transcript)
│   └── audio-processor.js # AudioWorklet para captura de micrófono
└── models/                # Modelos descargados (no commitear)
    ├── es_AR-daniela-high.onnx
    └── es_AR-daniela-high.onnx.json
```

## Configuración (server.py)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `WHISPER_MODEL` | `small` | Modelo Whisper (`tiny`, `base`, `small`, `medium`, `large-v3`) |
| `ENERGY_THRESHOLD` | `200` | Sensibilidad VAD (más alto = menos sensible a ruido) |
| `SILENCE_THRESHOLD_MS` | `800` | ms de silencio para consolidar segmento |
| `PARTIAL_INTERVAL_MS` | `600` | Cada cuánto enviar transcripción parcial |

## Resultados del Spike

### Validado
- getUserMedia funciona sin WebRTC para acceso al micrófono
- WebSocket es suficiente para streaming bidireccional de audio
- faster-whisper `small` da transcripciones precisas en español en CPU (Mac M-series)
- Piper TTS genera audio natural en español
- El loop completo STT → LLM → TTS funciona end-to-end
- Parciales con beam_size=1 dan sensación de tiempo real sin sacrificar precisión del final

### Limitaciones / Pendientes
- **Barge-in no funciona**: no se puede interrumpir el audio de Piper mientras se reproduce. WebSocket no maneja canales de audio independientes como WebRTC
- **No hay streaming de TTS**: Piper genera todo el audio de golpe antes de enviarlo. Se podría streamear por oraciones
- **CPU only**: en producción se necesita GPU para Whisper. Opciones: RunPod Serverless, Whisper API de OpenAI ($0.006/min)
- **Alucinaciones de Whisper**: filtro básico por lista negra. En producción usar confidence scores

### Siguiente paso: WebRTC
Para resolver el barge-in, el siguiente spike debería usar WebRTC con canales independientes:
- **Media Track de entrada**: audio del micrófono del usuario
- **Media Track de salida**: audio de Piper TTS
- Los tracks son independientes, la interrupción es nativa del protocolo
- Más complejo de implementar pero resuelve la separación de canales

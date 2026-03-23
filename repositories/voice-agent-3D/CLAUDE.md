# CLAUDE.md — Voice Agent 3D (Leo)

Avatar 3D animado con voz en tiempo real, powered by LemonSlice.

---

## Overview

**Leo** es un avatar 3D animado (león estilo Pixar) que funciona como asistente virtual con lip-sync en tiempo real. Usa LemonSlice para el avatar, Deepgram para STT, ElevenLabs para TTS, y Claude como LLM, todo orquestado por LiveKit Cloud via WebRTC.

---

## Architecture

```
Browser (WebRTC) ←→ LiveKit Cloud ←→ Agent (Python)
                                        ├─ Deepgram STT (Nova 3, streaming)
                                        ├─ Claude Haiku 4.5 (LLM)
                                        ├─ ElevenLabs TTS (Flash v2.5, streaming)
                                        ├─ LemonSlice (avatar 3D lip-sync)
                                        └─ Odoo MCP (optional, 9 appointment tools)
```

---

## Stack

| Component | Service | Config |
|-----------|---------|--------|
| **Avatar** | LemonSlice | Image URL or Agent ID (env var) |
| **STT** | Deepgram Nova 3 | `es`, streaming, `endpointing_ms=200` |
| **TTS** | ElevenLabs Flash v2.5 | Voice ID via env var (TODO: voz masculina) |
| **LLM** | Claude Haiku 4.5 | temperature=0.3 |
| **VAD** | Silero | Prewarmed at process start |
| **Transport** | LiveKit Cloud | WebRTC |
| **MCP** | Odoo (optional) | 9 appointment tools via HTTP |

---

## Environment Variables

```env
# Required — LemonSlice (one of these two)
LEMONSLICE_API_KEY=<key>
LEMONSLICE_AVATAR_IMAGE_URL=<public URL to 368x560px image>
# or
LEMONSLICE_AGENT_ID=<agent ID from LemonSlice dashboard>

# Required — STT/LLM/TTS
DEEPGRAM_API_KEY=<key>
ELEVENLABS_API_KEY=<key>
ELEVENLABS_VOICE_ID=<voice ID for the lion character>
ANTHROPIC_API_KEY=<key>

# Required — LiveKit
LIVEKIT_URL=<wss://...>
LIVEKIT_API_KEY=<key>
LIVEKIT_API_SECRET=<secret>

# Optional
ODOO_MCP_URL=http://odoo_mcp:8100/internal/mcp/call-tool
```

---

## Setup

```bash
# Install dependencies
uv sync --extra cloud

# Run locally
python agent.py start
```

---

## TODO

- [ ] Comprar plan LemonSlice Starter ($8/mo) y crear API key
- [ ] Generar imagen del león 3D (368x560px, cara grande, boca abierta)
- [ ] Subir imagen a URL pública o crear agent en LemonSlice dashboard
- [ ] Elegir voz masculina en ElevenLabs para el personaje
- [ ] Probar integración end-to-end

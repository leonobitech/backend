# CLAUDE.md — Voice Agent (Leonobit)

Avatar digital RT con voz para Leonobitech.

---

## Overview

**Leonobit** es el avatar digital de Leonobitech — una asistente virtual femenina con lip-sync en tiempo real. Usa Beyond Presence para el avatar, Deepgram para STT, ElevenLabs para TTS, y Claude como LLM, todo orquestado por LiveKit Cloud via WebRTC.

---

## Architecture

```
Browser (WebRTC) ←→ LiveKit Cloud ←→ Agent (VPS Python)
                                        ├─ Deepgram STT (Nova 3, streaming)
                                        ├─ Claude Haiku 4.5 (LLM)
                                        ├─ ElevenLabs TTS (Flash v2.5, streaming)
                                        ├─ Beyond Presence (avatar lip-sync)
                                        └─ Odoo MCP (optional, 9 appointment tools)
```

---

## Files

| File | Purpose |
|------|---------|
| `agent.py` | Main entrypoint — VoiceAssistant Agent + Beyond Presence avatar + room cleanup |
| `pyproject.toml` | Dependencies: `[cloud]` (production) and `[local]` (legacy) |
| `Dockerfile` | Production build: Python 3.12-slim, non-root user `agent` |
| `stt_whisper.py` | LEGACY: Custom faster-whisper STT plugin (not used in production) |
| `tts_piper.py` | LEGACY: Custom Piper TTS plugin (not used in production) |
| `playground.html` | LEGACY: Dev WebRTC testing UI |
| `playground_server.py` | LEGACY: Local token server for dev |

---

## Stack

| Component | Service | Config |
|-----------|---------|--------|
| **Avatar** | Beyond Presence | Avatar ID: `694c83e2-8895-4a98-bd16-56332ca3f449` |
| **STT** | Deepgram Nova 3 | `es`, streaming, `endpointing_ms=300` |
| **TTS** | ElevenLabs Flash v2.5 | Voice ID: `nTkjq09AuYgsNR8E4sDe`, stability=0.5 |
| **LLM** | Claude Haiku 4.5 | temperature=0.5 |
| **VAD** | Silero | Prewarmed at process start |
| **Transport** | LiveKit Cloud | `wss://voice-agent-b3y6eyhw.livekit.cloud` |
| **MCP** | Odoo (optional) | 9 appointment tools via HTTP |

---

## Development

```bash
# Install dependencies (production stack)
uv sync --extra cloud

# Run locally (needs .env.local with all API keys)
python agent.py start

# Run with Docker
docker build -t voice-agent .
docker run --env-file .env voice-agent
```

### Environment Variables

```env
# Required
DEEPGRAM_API_KEY=<key>
ELEVENLABS_API_KEY=<key>
ANTHROPIC_API_KEY=<key>
LIVEKIT_URL=<wss://...>
LIVEKIT_API_KEY=<key>
LIVEKIT_API_SECRET=<secret>

# Optional
BEY_AVATAR_ID=694c83e2-8895-4a98-bd16-56332ca3f449
ODOO_MCP_URL=http://odoo_mcp:8100/internal/mcp/call-tool
```

---

## Frontend Integration

The avatar is served at `leonobitech.com/demo`:
- **Desktop**: Fullscreen avatar video + chat transcriptions
- **Mobile**: Long press "Agente" button (1.5s) in TabBar → fullscreen overlay
- **Token endpoint**: `POST /api/voice/token` (Turnstile CAPTCHA + rate limit 5/min/IP)
- **Disconnect**: `POST /api/voice/disconnect` (verified with disconnectSecret)

Frontend components in `frontend/components/voice/`:
- `AvatarVideo.tsx` — Renders avatar video stream
- `VoiceChatDesktop.tsx` / `VoiceChatMobile.tsx` — Chat UIs
- `VoiceCallContext.tsx` — Global call state
- `ChatBubble.tsx`, `ChatHeader.tsx`, `DesktopControls.tsx`, `LongPressRing.tsx`

---

## Key Behaviors

- **Barge-in**: Enabled, 1 word minimum, 0.5s duration threshold
- **Preemptive generation**: Starts generating response while user is still speaking
- **Avatar sync**: Waits for Beyond Presence video track before greeting (15s timeout)
- **Room cleanup**: Auto-deletes room when user disconnects
- **Noise cancellation**: BVC plugin applied if available

---

## Infrastructure

- **VPS container**: `voice_agent` (3 CPU, 2 GB RAM limit)
- **Idle consumption**: ~472 MB RAM, <1% CPU (all heavy lifting is cloud)
- **Deploy**: Push to `main` → CI/CD auto-deploys

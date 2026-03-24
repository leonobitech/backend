# CLAUDE.md — Voice Agent (Leonobit)

Avatar digital RT con voz para Leonobitech.

---

## Overview

**Leonobit** es el avatar digital de Leonobitech — una asistente virtual femenina con lip-sync en tiempo real. Usa Beyond Presence para el avatar, Deepgram para STT, ElevenLabs para TTS, y Claude como LLM, todo orquestado por **LiveKit self-hosted** via WebRTC.

---

## Architecture

```
Browser (WebRTC) ←→ Traefik (TLS) ←→ LiveKit Server (self-hosted, host mode)
                                        ↕
                                    Agent (VPS Python, host mode)
                                        ├─ Deepgram STT (Nova 3, streaming)
                                        ├─ Claude Haiku 4.5 (LLM)
                                        ├─ ElevenLabs TTS (Flash v2.5, streaming)
                                        ├─ Beyond Presence (avatar lip-sync, external)
                                        ├─ Silero VAD (prewarmed)
                                        └─ Odoo MCP (optional, 9 appointment tools)
```

---

## Files

| File | Purpose |
|------|---------|
| `agent.py` | Main entrypoint — VoiceAssistant Agent + Beyond Presence avatar + room cleanup |
| `pyproject.toml` | Dependencies: `[cloud]` (production) and `[local]` (legacy) |
| `Dockerfile` | Production build: Python 3.12-slim, non-root user `agent` |
| `stt_whisper.py` | LEGACY: Custom faster-whisper STT plugin (not used) |
| `tts_piper.py` | LEGACY: Custom Piper TTS plugin (not used) |
| `playground.html` | LEGACY: Dev WebRTC testing UI |
| `playground_server.py` | LEGACY: Local token server for dev |

---

## Stack

| Component | Service | Config |
|-----------|---------|--------|
| **Avatar** | Beyond Presence | Avatar ID via `BEY_AVATAR_ID` env (required) |
| **STT** | Deepgram Nova 3 | `es`, streaming, `endpointing_ms=200` |
| **TTS** | ElevenLabs Flash v2.5 | Voice ID: `nTkjq09AuYgsNR8E4sDe`, stability=0.5, chunk_length_schedule=[30,50,100] |
| **LLM** | Claude Haiku 4.5 | temperature=0.3 |
| **VAD** | Silero | Prewarmed at process start |
| **Turn Detection** | MultilingualModel | AI-based, 14 languages, min_delay=0.3s, max_delay=1.5s |
| **Transport** | LiveKit self-hosted | `ws://127.0.0.1:7880` (internal), `wss://lk.leonobitech.com` (public) |
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
LIVEKIT_URL=ws://127.0.0.1:7880          # Internal (agent → LiveKit, same host)
LIVEKIT_PUBLIC_URL=wss://lk.leonobitech.com  # Public (Beyond Presence external access)
LIVEKIT_API_KEY=<key>
LIVEKIT_API_SECRET=<secret>
BEY_AVATAR_ID=<avatar-id>                # Required, no default

# Optional
ODOO_MCP_URL=http://odoo_mcp:8100/internal/mcp/call-tool
```

**Two LiveKit URLs**: The agent connects to LiveKit internally via `ws://127.0.0.1:7880` (both in host mode). Beyond Presence is an external service that needs the public URL `wss://lk.leonobitech.com` to join the room.

---

## LiveKit Self-Hosted

LiveKit Server runs on the same VPS in `network_mode: host`:

| Component | Details |
|-----------|---------|
| **Image** | `livekit/livekit-server:v1.10.0` (pinned) |
| **Signaling** | Port 7880 (HTTP), proxied by Traefik as `wss://lk.leonobitech.com` |
| **WebRTC TCP** | Port 7881 (fallback for restrictive networks) |
| **WebRTC UDP** | Ports 50000-50100 (media) |
| **TURN** | Disabled (not needed for WiFi/4G, pending config fix for corporate networks) |
| **Redis** | DB 5 on `127.0.0.1:6379` (shared redis_core) |
| **Config** | Generated from `livekit.yaml.template` via `generate-config.sh` |
| **Domain** | `lk.leonobitech.com` (DNS-only, no Cloudflare proxy — required for WebRTC) |

### Firewall (UFW)

| Port | Protocol | Access | Purpose |
|------|----------|--------|---------|
| 7880 | TCP | Docker only (172.16.0.0/12) | LiveKit signaling (Traefik) |
| 7881 | TCP | Public | WebRTC TCP fallback |
| 50000:50100 | UDP | Public | WebRTC media |
| 443 | UDP | Public | TURN (disabled, reserved) |

---

## Frontend Integration

The voice agent is served at `leonobitech.com/demo`:
- **Desktop**: Fullscreen avatar video + chat transcriptions
- **Mobile**: Long press "Agente" button in TabBar → fullscreen overlay
- **Token endpoint**: `POST /api/voice/token` (Turnstile CAPTCHA + hostname validation + rate limit 5/min/IP)
- **Disconnect**: `POST /api/voice/disconnect` (HMAC-verified, stateless across Vercel instances)
- **LiveKit URL**: Hardcoded via `NEXT_PUBLIC_LIVEKIT_URL` env var (not from API response)

Frontend components in `frontend/components/voice/`:
- `AvatarVideo.tsx` — Renders Beyond Presence video stream
- `VoiceChatDesktop.tsx` / `VoiceChatMobile.tsx` — Chat UIs with LiveKit hooks
- `VoiceCallContext.tsx` — Global call state (mobile TabBar integration)
- `ChatBubble.tsx`, `ChatHeader.tsx`, `DesktopControls.tsx`, `LongPressRing.tsx`

---

## Key Behaviors

- **Barge-in**: Enabled, 1 word minimum, 0.5s duration threshold
- **Preemptive generation**: Starts generating response while user is still speaking
- **Avatar sync**: Waits for Beyond Presence video track before greeting (15s timeout)
- **Room cleanup**: Auto-deletes room when user disconnects
- **Prompt guardrails**: Refuses to reveal system info, requires verbal confirmation for MCP write operations
- **Privacy**: Transcription content NOT logged (only char count for metrics)

---

## Infrastructure

- **VPS containers**: `voice_agent` (3 CPU, 2 GB RAM) + `livekit_server` (host mode)
- **Idle consumption**: ~472 MB RAM voice_agent + ~200 MB LiveKit Server
- **Deploy**: Push to `main` → CI/CD auto-deploys
- **Health checks**: voice_agent on `:8081`, livekit_server on `:7880`
- **Dependency chain**: redis_core (healthy) → livekit_server (healthy) → voice_agent

## Security

- `no-new-privileges: true` on voice_agent
- `shm_size: 256m` (required for WebRTC PeerConnection in Docker)
- LiveKit API keys in `.env` (gitignored), config generated via `generate-config.sh`
- Token grants: minimal (`roomJoin`, `canPublish`, `canSubscribe` — no `canPublishData`, no `agent`)
- HMAC disconnect secrets (no in-memory storage)
- Traefik middlewares: `rate-limit-strict` + `ws-safe` on LiveKit router

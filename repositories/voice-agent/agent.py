import asyncio
import logging
import os
import time

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io, function_tool, RunContext, mcp, stt, metrics
from livekit.api import LiveKitAPI, DeleteRoomRequest
from livekit.plugins import anthropic, bey, deepgram, elevenlabs, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

try:
    from livekit.plugins import noise_cancellation
    HAS_NOISE_CANCELLATION = True
except ImportError:
    HAS_NOISE_CANCELLATION = False


# Load .env.local only in local dev (skip in Docker where env is injected)
if os.path.exists(".env.local"):
    load_dotenv(".env.local", override=True)

logger = logging.getLogger("voice-agent")
logger.setLevel(logging.INFO)


class VoiceAssistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""Eres Leonobit, la asistente virtual de Leonobitech.
            Eres una mujer profesional, amigable y con buena energia.
            Ayudas a los usuarios con sus consultas de forma concisa y natural.
            Hablas en español, como en una conversacion real.
            Responde en maximo 2-3 oraciones cortas.
            No uses markdown, emojis ni formato especial ya que estas hablando por voz.
            Siempre usa genero femenino al referirte a ti misma.
            Termina siempre tus respuestas con una oracion completa que termine en punto.""",
        )

    async def on_enter(self):
        # Greeting is triggered after avatar is ready, not here
        pass


server = AgentServer()


def prewarm(proc: agents.JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name="voice-assistant")
async def entrypoint(ctx: agents.JobContext):
    ctx.log_context_fields = {"room": ctx.room.name}

    # MCP servers (Odoo appointment tools)
    mcp_servers = []
    odoo_mcp_url = os.getenv("ODOO_MCP_URL")
    if odoo_mcp_url:
        mcp_servers.append(mcp.MCPServerHTTP(odoo_mcp_url))
        logger.info(f"Odoo MCP conectado: {odoo_mcp_url}")

    # Cloud STT: Deepgram Nova 3 (streaming, low latency)
    deepgram_stt = deepgram.STT(
        model="nova-3",
        language="es",
        endpointing_ms=200,
        api_key=os.getenv("DEEPGRAM_API_KEY"),
    )

    # Cloud TTS: ElevenLabs Flash (low latency, streaming)
    elevenlabs_tts = elevenlabs.TTS(
        voice_id="nTkjq09AuYgsNR8E4sDe",
        model="eleven_flash_v2_5",
        language="es",
        voice_settings=elevenlabs.VoiceSettings(
            stability=0.5,
            similarity_boost=0.75,
            style=0.0,
            speed=1.0,
            use_speaker_boost=False,
        ),
        chunk_length_schedule=[30, 50, 100],
        api_key=os.getenv("ELEVENLABS_API_KEY"),
    )

    session = AgentSession(
        stt=deepgram_stt,
        llm=anthropic.LLM(
            model="claude-haiku-4-5-20251001",
            temperature=0.3,
            api_key=os.getenv("ANTHROPIC_API_KEY"),
        ),
        tts=elevenlabs_tts,
        vad=ctx.proc.userdata["vad"],
        mcp_servers=mcp_servers,
        # Interruption handling
        allow_interruptions=True,
        min_interruption_duration=0.5,
        min_interruption_words=1,
        # Turn detection: AI-based multilingual model (replaces VAD-only endpointing)
        turn_detection=MultilingualModel(),
        min_endpointing_delay=0.3,
        max_endpointing_delay=1.5,
        preemptive_generation=True,
    )

    room_opts = room_io.RoomOptions()
    if HAS_NOISE_CANCELLATION:
        room_opts = room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=noise_cancellation.BVC(),
            ),
        )

    await session.start(
        room=ctx.room,
        agent=VoiceAssistant(),
        room_options=room_opts,
    )

    await ctx.connect()

    # ── Pipeline metrics & timing ──────────────────────────────────
    session_start_time = time.monotonic()
    turn_counter = {"n": 0}

    @session.on("metrics_collected")
    def on_metrics_collected(ev):
        # Still works in 1.5.0, will migrate when ChatMessage.metrics is available
        metrics.log_metrics(ev.metrics)

    @session.on("agent_state_changed")
    def on_agent_state_changed(state: str):
        elapsed = time.monotonic() - session_start_time
        logger.info(f"[PIPELINE] agent_state={state} t={elapsed:.3f}s")

    @session.on("user_state_changed")
    def on_user_state_changed(state: str):
        elapsed = time.monotonic() - session_start_time
        logger.info(f"[PIPELINE] user_state={state} t={elapsed:.3f}s")

    @session.on("user_input_transcribed")
    def on_user_input(ev):
        elapsed = time.monotonic() - session_start_time
        is_final = getattr(ev, "is_final", True)
        transcript = getattr(ev, "transcript", "")
        if is_final and transcript:
            logger.info(f"[PIPELINE] stt_final t={elapsed:.3f}s text=\"{transcript}\"")

    @session.on("conversation_item_added")
    def on_conversation_item(ev):
        elapsed = time.monotonic() - session_start_time
        item = ev.item
        role = getattr(item, "role", "unknown")
        text = getattr(item, "text_content", "")
        interrupted = getattr(item, "interrupted", False)
        if role == "assistant":
            turn_counter["n"] += 1
            logger.info(f"[PIPELINE] turn={turn_counter['n']} role={role} interrupted={interrupted} t={elapsed:.3f}s text=\"{text[:80]}\"")
        else:
            logger.info(f"[PIPELINE] turn={turn_counter['n']} role={role} t={elapsed:.3f}s text=\"{text[:80]}\"")

    last_usage = {"tokens": 0}

    @session.on("session_usage_updated")
    def on_usage_updated(ev):
        usage = ev.usage
        total = sum(getattr(mu, "input_tokens", 0) + getattr(mu, "output_tokens", 0) for mu in usage.model_usage)
        if total != last_usage["tokens"]:
            last_usage["tokens"] = total
            for mu in usage.model_usage:
                inp = getattr(mu, "input_tokens", 0)
                out = getattr(mu, "output_tokens", 0)
                if inp or out:
                    logger.info(f"[USAGE] model={getattr(mu, 'model', 'unknown')} in={inp} out={out}")

    # ── Beyond Presence avatar (lip-synced video participant) ──────
    avatar = None
    avatar_id = os.getenv("BEY_AVATAR_ID", "694c83e2-8895-4a98-bd16-56332ca3f449")
    avatar_boot_start = time.monotonic()
    logger.info(f"[PIPELINE] avatar_boot_start id={avatar_id} t={avatar_boot_start - session_start_time:.3f}s")
    try:
        avatar = bey.AvatarSession(avatar_id=avatar_id)
        await avatar.start(session, room=ctx.room)
        avatar_started = time.monotonic() - avatar_boot_start
        logger.info(f"[PIPELINE] avatar_session_started dt={avatar_started:.3f}s")

        # Wait for avatar to publish video track before greeting
        avatar_ready = asyncio.Event()

        @ctx.room.on("track_published")
        def on_track_published(publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
            if participant.identity.startswith("bey-") and publication.kind == rtc.TrackKind.KIND_VIDEO:
                avatar_track_dt = time.monotonic() - avatar_boot_start
                logger.info(f"[PIPELINE] avatar_video_track_ready dt={avatar_track_dt:.3f}s participant={participant.identity}")
                avatar_ready.set()

        # Check if avatar already published (race condition)
        for p in ctx.room.remote_participants.values():
            if p.identity.startswith("bey-"):
                for pub in p.track_publications.values():
                    if pub.kind == rtc.TrackKind.KIND_VIDEO:
                        avatar_ready.set()
                        break

        try:
            await asyncio.wait_for(avatar_ready.wait(), timeout=15.0)
            avatar_total = time.monotonic() - avatar_boot_start
            logger.info(f"[PIPELINE] avatar_ready_total dt={avatar_total:.3f}s")
        except asyncio.TimeoutError:
            logger.warning(f"[PIPELINE] avatar_timeout after 15.0s")

        greeting_start = time.monotonic()
        session.generate_reply(
            instructions="Presentate como Leonobit, la asistente virtual de Leonobitech. Saluda brevemente y pregunta en que puedes ayudar."
        )
        logger.info(f"[PIPELINE] greeting_dispatched t={time.monotonic() - session_start_time:.3f}s")
    except Exception as e:
        logger.error(f"[PIPELINE] avatar_failed error={e} dt={time.monotonic() - avatar_boot_start:.3f}s")
        session.generate_reply(
            instructions="Presentate como Leonobit, la asistente virtual de Leonobitech. Saluda brevemente y pregunta en que puedes ayudar."
        )

    # Disconnect agent + force delete room when user leaves
    @ctx.room.on("participant_disconnected")
    def on_participant_left(participant: rtc.RemoteParticipant):
        if participant.identity.startswith("user-"):
            logger.info(f"User left, cleaning up room {ctx.room.name}")

            async def cleanup_room():
                try:
                    api = LiveKitAPI()
                    await api.room.delete_room(DeleteRoomRequest(room=ctx.room.name))
                    await api.aclose()
                    logger.info(f"Room {ctx.room.name} deleted via API")
                except Exception as e:
                    logger.warning(f"Error deleting room: {e}")

            asyncio.ensure_future(cleanup_room())
            ctx.shutdown(reason="user disconnected")


if __name__ == "__main__":
    agents.cli.run_app(server)

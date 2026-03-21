import asyncio
import logging
import os

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io, function_tool, RunContext, mcp, stt
from livekit.api import LiveKitAPI, DeleteRoomRequest
from livekit.plugins import anthropic, bey, deepgram, elevenlabs, silero

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
        smart_format=True,
        endpointing_ms=300,
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
            use_speaker_boost=True,
        ),
        chunk_length_schedule=[50],
        api_key=os.getenv("ELEVENLABS_API_KEY"),
    )

    session = AgentSession(
        stt=deepgram_stt,
        llm=anthropic.LLM(
            model="claude-haiku-4-5-20251001",
            temperature=0.5,
            api_key=os.getenv("ANTHROPIC_API_KEY"),
        ),
        tts=elevenlabs_tts,
        vad=ctx.proc.userdata["vad"],
        mcp_servers=mcp_servers,
        # Interruption handling
        allow_interruptions=True,
        min_interruption_duration=0.5,
        min_interruption_words=1,
        # Faster turn detection
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

    # Beyond Presence avatar (lip-synced video participant)
    avatar = None
    avatar_id = os.getenv("BEY_AVATAR_ID", "694c83e2-8895-4a98-bd16-56332ca3f449")
    logger.info(f"Starting Beyond Presence avatar: {avatar_id}")
    try:
        avatar = bey.AvatarSession(avatar_id=avatar_id)
        await avatar.start(session, room=ctx.room)
        logger.info("Beyond Presence avatar started successfully")

        # Wait for avatar to publish video track before greeting
        avatar_ready = asyncio.Event()

        @ctx.room.on("track_published")
        def on_track_published(publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
            if participant.identity.startswith("bey-") and publication.kind == rtc.TrackKind.KIND_VIDEO:
                logger.info(f"Avatar video track published by {participant.identity}")
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
            logger.info("Avatar video track ready, waiting for render...")
            await asyncio.sleep(1.5)  # Give frontend time to attach and render first frame
            logger.info("Greeting user")
        except asyncio.TimeoutError:
            logger.warning("Avatar video track timeout, greeting anyway")

        session.generate_reply(
            instructions="Presentate como Leonobit, la asistente virtual de Leonobitech. Saluda brevemente y pregunta en que puedes ayudar."
        )
    except Exception as e:
        logger.error(f"Beyond Presence avatar failed: {e}")
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

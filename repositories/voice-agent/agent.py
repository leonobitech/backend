import logging
import os

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io, function_tool, RunContext, mcp, stt
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
            instructions="""Eres un asistente de voz amigable de Leonobitech.
            Ayudas a los usuarios con sus consultas de forma concisa y natural.
            Hablas en español, como en una conversación real.
            Responde en maximo 2-3 oraciones.
            No uses markdown, emojis ni formato especial ya que estas hablando por voz.""",
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
        api_key=os.getenv("DEEPGRAM_API_KEY"),
    )

    # Cloud TTS: ElevenLabs Flash (low latency, streaming)
    elevenlabs_tts = elevenlabs.TTS(
        voice_id="QK4xDwo9ESPHA4JNUpX3",
        model="eleven_flash_v2_5",
        language="es",
        voice_settings=elevenlabs.VoiceSettings(
            stability=0.5,
            similarity_boost=0.75,
            style=0.2,
            speed=1.1,
            use_speaker_boost=True,
        ),
        api_key=os.getenv("ELEVENLABS_API_KEY"),
    )

    session = AgentSession(
        stt=deepgram_stt,
        llm=anthropic.LLM(
            model="claude-haiku-4-5-20251001",
            temperature=0.7,
            api_key=os.getenv("ANTHROPIC_API_KEY"),
        ),
        tts=elevenlabs_tts,
        vad=ctx.proc.userdata["vad"],
        mcp_servers=mcp_servers,
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
        # Greet only after avatar is visible
        session.generate_reply(
            instructions="Saluda al usuario brevemente y pregunta en que puedes ayudarle."
        )
    except Exception as e:
        logger.error(f"Beyond Presence avatar failed: {e}")
        # Greet anyway if avatar fails
        session.generate_reply(
            instructions="Saluda al usuario brevemente y pregunta en que puedes ayudarle."
        )

    # Disconnect agent + avatar when user leaves
    @ctx.room.on("participant_disconnected")
    def on_participant_left(participant: rtc.RemoteParticipant):
        if participant.identity.startswith("user-"):
            logger.info(f"User left, disconnecting agent from room {ctx.room.name}")
            if avatar:
                try:
                    import asyncio
                    asyncio.ensure_future(avatar.close())
                    logger.info("Beyond Presence avatar closed")
                except Exception as e:
                    logger.warning(f"Error closing avatar: {e}")
            ctx.shutdown(reason="user disconnected")


if __name__ == "__main__":
    agents.cli.run_app(server)

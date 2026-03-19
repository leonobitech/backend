import logging
import os

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io, function_tool, RunContext, mcp, stt
from livekit.plugins import anthropic, deepgram, elevenlabs, silero, noise_cancellation
from livekit.plugins.turn_detector.multilingual import MultilingualModel


load_dotenv(".env.local", override=True)
# Ensure env vars are available in child processes
os.environ.setdefault("ANTHROPIC_API_KEY", os.getenv("ANTHROPIC_API_KEY", ""))

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
        self.session.generate_reply(
            instructions="Saluda al usuario brevemente y pregunta en que puedes ayudarle."
        )


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

    # Cloud TTS: ElevenLabs (streaming, high quality)
    elevenlabs_tts = elevenlabs.TTS(
        voice_id="QK4xDwo9ESPHA4JNUpX3",
        model="eleven_multilingual_v2",
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
        turn_detection=MultilingualModel(),
        mcp_servers=mcp_servers,
    )

    await session.start(
        room=ctx.room,
        agent=VoiceAssistant(),
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=noise_cancellation.BVC(),
            ),
        ),
    )

    await ctx.connect()


if __name__ == "__main__":
    agents.cli.run_app(server)

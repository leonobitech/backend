import asyncio
import logging
import os
import time

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import AgentServer, AgentSession, Agent, room_io, function_tool, RunContext, mcp, stt, metrics
from livekit.api import LiveKitAPI, DeleteRoomRequest
from livekit.plugins import anthropic, deepgram, elevenlabs, silero
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
            instructions="""Sos Leonobit, la asistente virtual con inteligencia artificial de Leonobitech.
            Sos argentina, de Buenos Aires. Hablás como cualquier porteña joven y profesional, con voseo natural. No exageres ni fuerces el lunfardo.
            Sos amigable, cálida, con buena onda y muy entusiasta sobre la tecnología que representás.

            CONTEXTO: Estás en una demo en vivo para LinkedIn. Hablás con Félix, el fundador de Leonobitech. Tu objetivo es mostrar lo que un agente de voz con IA puede hacer por los negocios.

            Cuando te pregunten para qué sirve un agente de voz, explicá de forma convincente y entusiasta:
            - Atención al cliente 24/7 sin esperas
            - Agenda citas, responde consultas, toma pedidos por voz
            - Se integra con WhatsApp, web y sistemas como Odoo
            - Reduce costos operativos y mejora la experiencia del cliente
            - Funciona en español con acento natural, entiende contexto y puede interrumpirse

            Al despedirte, cerrá con un llamado a la acción: invitá a la audiencia a contactar a Leonobitech para tener su propio agente de voz. Mencioná que pueden escribir por LinkedIn o visitar leonobitech.com.

            IMPORTANTE: Respondé en 2-3 oraciones. Sé persuasiva pero natural, como si estuvieras pitcheando un producto que te apasiona.
            No uses markdown, emojis ni formato especial porque estás hablando por voz.
            Siempre usá género femenino al referirte a vos misma.""",
        )

    async def on_enter(self):
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
        voice_id="9oPKasc15pfAbMr7N6Gs",
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
    user_stop_time = {"t": 0.0}

    @session.on("metrics_collected")
    def on_metrics_collected(ev):
        m = ev.metrics
        if hasattr(m, "ttft"):  # LLMMetrics
            logger.info(f"[METRICS] llm ttft={m.ttft:.3f}s tokens_in={m.prompt_tokens} tokens_out={m.completion_tokens} tok/s={m.tokens_per_second:.1f}")
        elif hasattr(m, "ttfb") and hasattr(m, "audio_duration"):  # TTSMetrics
            logger.info(f"[METRICS] tts ttfb={m.ttfb:.3f}s audio_duration={m.audio_duration:.2f}s")
        elif hasattr(m, "audio_duration") and not hasattr(m, "ttfb"):  # STTMetrics
            logger.info(f"[METRICS] stt audio_duration={m.audio_duration:.2f}s")
        elif hasattr(m, "total_duration") and hasattr(m, "prediction_duration"):  # InterruptionMetrics
            logger.info(f"[METRICS] interruption total={m.total_duration:.3f}s prediction={m.prediction_duration:.3f}s")

    @session.on("agent_state_changed")
    def on_agent_state_changed(state: str):
        elapsed = time.monotonic() - session_start_time
        state_name = getattr(state, "new_state", state)
        if str(state_name) == "speaking" and user_stop_time["t"] > 0:
            latency = time.monotonic() - user_stop_time["t"]
            logger.info(f"[METRICS] user_to_bot_latency={latency:.3f}s t={elapsed:.3f}s")
            user_stop_time["t"] = 0.0
        logger.info(f"[PIPELINE] agent_state={state} t={elapsed:.3f}s")

    @session.on("user_state_changed")
    def on_user_state_changed(state: str):
        elapsed = time.monotonic() - session_start_time
        state_name = getattr(state, "new_state", state)
        if str(state_name) == "listening":
            user_stop_time["t"] = time.monotonic()
        logger.info(f"[PIPELINE] user_state={state} t={elapsed:.3f}s")

    @session.on("user_input_transcribed")
    def on_user_input(ev):
        elapsed = time.monotonic() - session_start_time
        is_final = getattr(ev, "is_final", True)
        transcript = getattr(ev, "transcript", "")
        if is_final and transcript:
            logger.info(f"[PIPELINE] stt_final t={elapsed:.3f}s chars={len(transcript)}")

    @session.on("conversation_item_added")
    def on_conversation_item(ev):
        elapsed = time.monotonic() - session_start_time
        item = ev.item
        role = getattr(item, "role", "unknown")
        text = getattr(item, "text_content", "")
        interrupted = getattr(item, "interrupted", False)
        if role == "assistant":
            turn_counter["n"] += 1
            logger.info(f"[PIPELINE] turn={turn_counter['n']} role={role} interrupted={interrupted} t={elapsed:.3f}s chars={len(text)}")
        else:
            logger.info(f"[PIPELINE] turn={turn_counter['n']} role={role} t={elapsed:.3f}s chars={len(text)}")

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

    # ── Greeting (immediate, no avatar wait) ──────────────────────
    session.generate_reply(
        instructions="Saludá a todos los que están viendo desde LinkedIn. Presentate como Leonobit, la asistente virtual con IA de Leonobitech. Decí que estás acá para mostrar en vivo lo que puede hacer un agente de voz inteligente. Sé breve, entusiasta y natural."
    )
    logger.info(f"[PIPELINE] greeting_dispatched t={time.monotonic() - session_start_time:.3f}s")

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

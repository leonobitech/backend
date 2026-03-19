"""Simple server that generates LiveKit tokens, dispatches agents, and serves the playground."""

import asyncio
import json
import threading
from pathlib import Path

from dotenv import load_dotenv
from livekit import api

load_dotenv(".env.local")

from http.server import HTTPServer, SimpleHTTPRequestHandler

API_KEY = "devkey"
API_SECRET = "secret"
LIVEKIT_URL = "http://localhost:7880"


def dispatch_agent(room_name: str):
    """Create room and dispatch agent in background."""
    async def _dispatch():
        lk = api.LiveKitAPI(LIVEKIT_URL, API_KEY, API_SECRET)
        try:
            await lk.room.create_room(api.CreateRoomRequest(name=room_name))
            await lk.agent_dispatch.create_dispatch(
                api.CreateAgentDispatchRequest(
                    agent_name="voice-assistant",
                    room=room_name,
                )
            )
            print(f"Agent dispatched to room: {room_name}")
        except Exception as e:
            print(f"Dispatch error: {e}")
        finally:
            await lk.aclose()

    loop = asyncio.new_event_loop()
    loop.run_until_complete(_dispatch())
    loop.close()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).parent), **kwargs)

    def do_GET(self):
        if self.path == "/token":
            room_name = "test-room"

            token = api.AccessToken(API_KEY, API_SECRET) \
                .with_identity("user-felix") \
                .with_name("Felix") \
                .with_grants(api.VideoGrants(
                    room_join=True,
                    room=room_name,
                )) \
                .with_room_config(api.RoomConfiguration(
                    agents=[api.RoomAgentDispatch(agent_name="voice-assistant")]
                ))

            # Also explicitly dispatch the agent
            threading.Thread(target=dispatch_agent, args=(room_name,), daemon=True).start()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"token": token.to_jwt()}).encode())
        else:
            super().do_GET()


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 8202), Handler)
    print("Playground: http://localhost:8202/playground.html")
    server.serve_forever()

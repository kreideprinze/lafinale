"""WebSocket router — JWT-authenticated live channel."""
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from security import decode_token_safe
from ws_hub import hub
from db import get_db

router = APIRouter(tags=["ws"])


@router.websocket("/api/ws")
async def ws_endpoint(websocket: WebSocket, token: str = Query(...)):
    payload = decode_token_safe(token)
    if not payload or payload.get("type") != "access":
        await websocket.close(code=4401)
        return
    user_id = payload["sub"]
    role = payload.get("role", "operator")

    db = get_db()
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or not user.get("active", True):
        await websocket.close(code=4401)
        return

    await websocket.accept()
    # Default channels
    await hub.subscribe(websocket, f"user:{user_id}")
    await hub.subscribe(websocket, f"role:{role}")
    await hub.send_direct(websocket, {"type": "hello", "user_id": user_id, "role": role})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            op = msg.get("op")
            if op == "subscribe":
                for ch in msg.get("channels", []):
                    if isinstance(ch, str):
                        await hub.subscribe(websocket, ch)
                await hub.send_direct(websocket, {"type": "ack", "op": "subscribe",
                                                     "channels": msg.get("channels", [])})
            elif op == "unsubscribe":
                for ch in msg.get("channels", []):
                    if isinstance(ch, str):
                        await hub.unsubscribe(websocket, ch)
                await hub.send_direct(websocket, {"type": "ack", "op": "unsubscribe",
                                                     "channels": msg.get("channels", [])})
            elif op == "ping":
                await hub.send_direct(websocket, {"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        await hub.drop(websocket)

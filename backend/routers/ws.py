"""WebSocket router — supports both authenticated and public (kiosk) connections.

Authenticated users (with valid JWT via ?token=) get user/role-scoped channels.
Anonymous connections (no token) get a public read-only channel — used for the
operator kiosk view of the Control Room.
"""
import json
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from security import decode_token_safe
from ws_hub import hub
from db import get_db

router = APIRouter(tags=["ws"])


@router.websocket("/api/ws")
async def ws_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    user_id: Optional[str] = None
    role: str = "public"

    if token:
        payload = decode_token_safe(token)
        if payload and payload.get("type") == "access":
            db = get_db()
            u = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
            if u and u.get("active", True):
                user_id = u["id"]
                role = u.get("role", "operator")

    await websocket.accept()
    if user_id:
        await hub.subscribe(websocket, f"user:{user_id}")
        await hub.subscribe(websocket, f"role:{role}")
    else:
        await hub.subscribe(websocket, "public")
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

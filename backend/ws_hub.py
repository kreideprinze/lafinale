"""In-process WebSocket hub for live SCADA-style updates."""
import asyncio
import json
from datetime import datetime, timezone
from typing import Set, Dict, Any
from fastapi import WebSocket


class WSHub:
    def __init__(self):
        self._channels: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, ws: WebSocket, channel: str):
        async with self._lock:
            self._channels.setdefault(channel, set()).add(ws)

    async def unsubscribe(self, ws: WebSocket, channel: str):
        async with self._lock:
            if channel in self._channels:
                self._channels[channel].discard(ws)
                if not self._channels[channel]:
                    del self._channels[channel]

    async def drop(self, ws: WebSocket):
        async with self._lock:
            for ch in list(self._channels.keys()):
                self._channels[ch].discard(ws)
                if not self._channels[ch]:
                    del self._channels[ch]

    async def broadcast(self, channel: str, event: str, payload: Dict[str, Any]):
        message = json.dumps({
            "type": "event",
            "channel": channel,
            "event": event,
            "at": datetime.now(timezone.utc).isoformat(),
            "payload": _to_jsonable(payload),
        }, default=str)
        dead = []
        async with self._lock:
            targets = list(self._channels.get(channel, set()))
        for ws in targets:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.drop(ws)

    async def send_direct(self, ws: WebSocket, message: Dict[str, Any]):
        try:
            await ws.send_text(json.dumps(message, default=str))
        except Exception:
            pass


def _to_jsonable(o):
    if isinstance(o, dict):
        return {k: _to_jsonable(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_to_jsonable(v) for v in o]
    if isinstance(o, datetime):
        return o.isoformat()
    return o


hub = WSHub()

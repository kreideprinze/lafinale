"""Factory CMMS Enterprise — FastAPI application entry."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import ensure_indexes
from seed import seed_all

from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.masters import router as masters_router
from routers.breakdowns import router as breakdowns_router
from routers.work_orders import router as work_orders_router
from routers.analytics import router as analytics_router
from routers.timeline import router as timeline_router
from routers.runtime import router as runtime_router
from routers.notifications import router as notifications_router
from routers.imports import router as imports_router
from routers.ws import router as ws_router

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                     format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("factory_cmms")

app = FastAPI(title="Factory CMMS Enterprise", version="1.0.0")

# CORS — LAN-friendly. For factory network, wildcard is acceptable; can be restricted via CORS_ORIGINS env.
origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=False if origins == ["*"] else True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"ok": True, "service": "factory-cmms", "version": "1.0.0"}


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(masters_router)
app.include_router(breakdowns_router)
app.include_router(work_orders_router)
app.include_router(analytics_router)
app.include_router(timeline_router)
app.include_router(runtime_router)
app.include_router(notifications_router)
app.include_router(imports_router)
app.include_router(ws_router)


@app.on_event("startup")
async def _startup():
    try:
        await ensure_indexes()
        await seed_all()
        logger.info("Startup: indexes ensured, seed complete.")
    except Exception as e:
        logger.exception(f"Startup failure: {e}")


@app.on_event("shutdown")
async def _shutdown():
    logger.info("Shutdown: closing.")

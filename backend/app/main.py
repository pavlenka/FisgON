"""Punto de entrada de FisgON: FastAPI, routers y loop de ingesta periódica."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import auth, contacts, dashboard, feed, sources, worker
from .config import settings
from .db import init_db

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("fisgon")


async def _poll_loop() -> None:
    """Cada POLL_MINUTES refresca todas las fuentes activas (en un thread aparte)."""
    while True:
        await asyncio.sleep(settings.poll_minutes * 60)
        try:
            await asyncio.to_thread(worker.process_all_active_sources)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("Error en el barrido periódico")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(_poll_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="FisgON", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(sources.router, prefix="/api")
app.include_router(contacts.router, prefix="/api")
app.include_router(feed.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


@app.get("/api/health")
def health() -> dict:
    model = settings.opencode_model if settings.llm_provider == "opencode" else settings.ollama_model
    return {"status": "ok", "provider": settings.llm_provider, "model": model}

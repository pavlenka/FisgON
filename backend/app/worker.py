"""Procesado en segundo plano: ingesta + análisis IA de cada fuente.

Se guardan TODAS las noticias analizadas (también las descartadas) para no
reprocesarlas; el feed ya filtra por on_topic + umbral. Mantiene un pequeño
estado en memoria por usuario para que el frontend muestre el progreso.
"""
import logging
from datetime import datetime

from sqlmodel import Session, select

from . import ingest, llm
from .config import settings
from .db import engine
from .models import Article, Source

log = logging.getLogger("fisgon.worker")

# Estado de refresco por usuario, para el spinner del frontend.
_status: dict[int, dict] = {}


def get_status(user_id: int) -> dict:
    return _status.get(user_id, {"processing": False, "new": 0})


def process_source(session: Session, source: Source) -> int:
    """Procesa una fuente y devuelve cuántas noticias nuevas se han guardado."""
    new_count = 0
    entries = ingest.fetch_entries(source.feed_url, settings.max_entries_per_source)
    for entry in entries:
        already = session.exec(
            select(Article).where(
                Article.source_id == source.id,
                Article.guid == entry["guid"],
            )
        ).first()
        if already:
            continue

        article_data = ingest.extract_article(entry["link"])
        text = article_data["text"] or entry["summary"]
        analysis = llm.analyze_article(source.topics, entry["title"], text)
        # El feed prioriza la imagen del propio feed; si no trae, usamos el og:image.
        image_url = entry["image"] or article_data["image"]

        session.add(
            Article(
                source_id=source.id,
                guid=entry["guid"],
                link=entry["link"],
                original_title=entry["title"],
                title=analysis["title"],
                summary=analysis["summary"],
                image_url=image_url,
                interesting_score=analysis["interesting"],
                on_topic=analysis["on_topic"],
                published_at=entry["published"],
            )
        )
        session.commit()
        new_count += 1

    source.last_fetched_at = datetime.utcnow()
    session.add(source)
    session.commit()
    return new_count


def process_user_sources(user_id: int) -> int:
    """Procesa todas las fuentes activas de un usuario."""
    total = 0
    with Session(engine) as session:
        sources = session.exec(
            select(Source).where(Source.user_id == user_id, Source.active == True)  # noqa: E712
        ).all()
        for source in sources:
            try:
                total += process_source(session, source)
            except Exception:  # noqa: BLE001 - una fuente rota no debe parar el resto
                log.exception("Error procesando la fuente %s (%s)", source.id, source.name)
    return total


def refresh_user(user_id: int) -> None:
    """Envuelve process_user_sources actualizando el estado en memoria."""
    _status[user_id] = {"processing": True, "new": 0}
    try:
        total = process_user_sources(user_id)
        _status[user_id] = {"processing": False, "new": total}
    except Exception:  # noqa: BLE001
        log.exception("Error en refresh_user(%s)", user_id)
        _status[user_id] = {"processing": False, "new": 0, "error": True}


def process_all_active_sources() -> None:
    """Barrido periódico de todas las fuentes activas de todos los usuarios."""
    with Session(engine) as session:
        user_ids = session.exec(
            select(Source.user_id).where(Source.active == True).distinct()  # noqa: E712
        ).all()
    for user_id in user_ids:
        refresh_user(user_id)

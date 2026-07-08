"""Procesado en segundo plano: ingesta + análisis IA de cada fuente.

Se guardan TODAS las noticias analizadas (también las descartadas) para no
reprocesarlas; el feed ya filtra por on_topic + umbral. Mantiene un pequeño
estado en memoria por usuario para que el frontend muestre el progreso.
"""
import logging
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from . import ingest, llm, topics
from .config import settings
from .db import engine
from .models import Article, Source

log = logging.getLogger("fisgon.worker")

# Estado de refresco por usuario, para el spinner del frontend.
_status: dict[int, dict] = {}


def get_status(user_id: int) -> dict:
    return _status.get(user_id, {"processing": False, "new": 0})


def _recent_feed_titles(session: Session, user_id: int) -> list[str]:
    """Titulares recientes ya visibles en el feed del usuario (todas sus fuentes),
    para que la IA detecte historias repetidas entre webs distintas."""
    cutoff = datetime.utcnow() - timedelta(days=3)
    rows = session.exec(
        select(Article.original_title)
        .join(Source, Article.source_id == Source.id)
        .where(
            Source.user_id == user_id,
            Article.on_topic == True,  # noqa: E712
            Article.is_duplicate == False,  # noqa: E712
            Article.published_at >= cutoff,
        )
        .order_by(Article.published_at.desc())
        .limit(40)
    ).all()
    return list(rows)


def process_source(session: Session, source: Source) -> int:
    """Procesa una fuente y devuelve cuántas noticias nuevas se han guardado."""
    new_count = 0
    entries = ingest.fetch_entries(source.feed_url, settings.max_entries_per_source)
    cutoff = datetime.utcnow() - timedelta(days=source.max_age_days)
    recent_titles = _recent_feed_titles(session, source.user_id)

    for entry in entries:
        # Fuera de la ventana de retención de esta fuente: no se ingiere (no borra
        # ni oculta lo que ya estuviera guardado). Corte barato en memoria, antes
        # de ir a BD.
        if entry["published"] < cutoff:
            continue

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
        analysis = llm.analyze_article(
            source.topics,
            entry["title"],
            text,
            session=session,
            user_id=source.user_id,
            source_id=source.id,
            recent_titles=recent_titles,
            summary_paragraphs=source.summary_paragraphs,
        )
        # El feed prioriza la imagen del propio feed; si no trae, usamos el og:image.
        image_url = entry["image"] or article_data["image"]
        # Si el usuario ya vetó este tema en la fuente, la noticia entra
        # descartada de fábrica (sin volver a molestarle con la decisión).
        manual_approved = False if topics.has_topic(source.vetoed_topics, analysis["topic"]) else None

        session.add(
            Article(
                source_id=source.id,
                guid=entry["guid"],
                link=entry["link"],
                original_title=entry["title"],
                title=analysis["title"],
                summary=analysis["summary"],
                topic=analysis["topic"],
                image_url=image_url,
                interesting_score=analysis["interesting"],
                on_topic=analysis["on_topic"],
                is_duplicate=analysis["duplicate"],
                manual_approved=manual_approved,
                published_at=entry["published"],
            )
        )
        try:
            session.commit()
        except IntegrityError:
            # Colisión de uq_source_guid a nivel de BD (p.ej. dos refrescos
            # solapados del mismo usuario). Se trata igual que "ya existía":
            # se descarta sin romper el resto de fuentes de esta pasada.
            session.rollback()
            log.info(
                "Guid duplicado a nivel de BD para la fuente %s (%s); se ignora",
                source.id,
                entry["guid"],
            )
            continue
        new_count += 1
        # Las siguientes entradas de esta misma pasada también deben ver este
        # titular para no colar la misma historia dos veces.
        if analysis["on_topic"] and not analysis["duplicate"]:
            recent_titles.insert(0, entry["title"])

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
                # Deja la sesión limpia para que la siguiente fuente de este mismo
                # lote no herede una transacción fallida.
                session.rollback()
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

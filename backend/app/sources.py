"""API de fuentes (webs de noticias) del usuario, con autodetección de tema."""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlmodel import Session, select

from . import ingest, llm, topics, worker
from .auth import get_current_user
from .db import get_session
from .models import Article, Source, User
from .schemas import (
    SourceCreate,
    SourceDetectRequest,
    SourceDetectResponse,
    SourceOut,
    SourceUpdate,
)

log = logging.getLogger("fisgon.sources")

router = APIRouter(prefix="/sources", tags=["sources"])


@router.post("/detect", response_model=SourceDetectResponse)
def detect_source(
    req: SourceDetectRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SourceDetectResponse:
    """Descubre el feed de una web y sugiere su tema (editable por el usuario)."""
    info = ingest.discover_feed(req.url)
    if info is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "No se encontró un feed RSS/Atom en esa web",
        )
    entries = ingest.fetch_entries(info["feed_url"], 12)
    titles = [e["title"] for e in entries if e["title"]]
    topics = llm.detect_topics(info["name"], titles, session=session, user_id=user.id)
    return SourceDetectResponse(
        site_url=info["site_url"],
        feed_url=info["feed_url"],
        name=info["name"],
        suggested_topics=topics,
    )


@router.get("", response_model=list[SourceOut])
def list_sources(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Source]:
    return session.exec(
        select(Source).where(Source.user_id == user.id).order_by(Source.created_at.desc())
    ).all()


@router.post("", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
def create_source(
    data: SourceCreate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Source:
    if not data.topics.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indica al menos un tema")
    _validate_max_age_days(data.max_age_days)
    source = Source(
        user_id=user.id,
        site_url=data.site_url,
        feed_url=data.feed_url,
        name=data.name,
        topics=data.topics.strip(),
        max_age_days=data.max_age_days,
    )
    session.add(source)
    session.commit()
    session.refresh(source)
    # Procesamos ya las noticias de esta fuente (y del resto) en segundo plano.
    background.add_task(worker.refresh_user, user.id)
    return source


def _validate_max_age_days(days: int) -> None:
    if days < 1 or days > 365:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La antigüedad debe estar entre 1 y 365 días")


def _get_owned_source(source_id: int, user: User, session: Session) -> Source:
    source = session.get(Source, source_id)
    if source is None or source.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fuente no encontrada")
    return source


@router.patch("/{source_id}", response_model=SourceOut)
def update_source(
    source_id: int,
    data: SourceUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Source:
    source = _get_owned_source(source_id, user, session)
    if data.name is not None:
        if not data.name.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "El nombre no puede estar vacío")
        source.name = data.name.strip()
    if data.site_url is not None:
        if not data.site_url.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "La URL de la web no puede estar vacía")
        source.site_url = data.site_url.strip()
    if data.feed_url is not None:
        if not data.feed_url.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "La URL del feed no puede estar vacía")
        source.feed_url = data.feed_url.strip()
    if data.topics is not None:
        if not data.topics.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indica al menos un tema")
        source.topics = data.topics.strip()
    if data.active is not None:
        source.active = data.active
    if data.in_feed is not None:
        source.in_feed = data.in_feed
    if data.max_age_days is not None:
        _validate_max_age_days(data.max_age_days)
        source.max_age_days = data.max_age_days
    if data.vetoed_topics is not None:
        # Normalizamos la lista (minúsculas, sin duplicados ni vacíos).
        source.vetoed_topics = ", ".join(topics.parse_topics(data.vetoed_topics))
    session.add(source)
    session.commit()
    session.refresh(source)
    return source


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(
    source_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    source = _get_owned_source(source_id, user, session)
    # Borramos también sus noticias para no dejar huérfanas.
    for article in session.exec(select(Article).where(Article.source_id == source.id)).all():
        session.delete(article)
    session.delete(source)
    session.commit()


@router.post("/{source_id}/filter-hit", status_code=status.HTTP_204_NO_CONTENT)
def filter_hit(
    source_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """El usuario ha filtrado el feed por esta fuente: se anota para ordenar
    los chips del feed por uso (las más filtradas, primero)."""
    source = _get_owned_source(source_id, user, session)
    source.filter_count += 1
    session.add(source)
    session.commit()


@router.post("/refresh")
def refresh(
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
) -> dict:
    """Dispara el procesado de las fuentes del usuario en segundo plano."""
    background.add_task(worker.refresh_user, user.id)
    return {"status": "started"}


@router.get("/refresh/status")
def refresh_status(user: User = Depends(get_current_user)) -> dict:
    return worker.get_status(user.id)

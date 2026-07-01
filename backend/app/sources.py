"""API de fuentes (webs de noticias) del usuario, con autodetección de tema."""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlmodel import Session, select

from . import ingest, llm, worker
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
    topics = llm.detect_topics(info["name"], titles)
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
    source = Source(
        user_id=user.id,
        site_url=data.site_url,
        feed_url=data.feed_url,
        name=data.name,
        topics=data.topics.strip(),
    )
    session.add(source)
    session.commit()
    session.refresh(source)
    # Procesamos ya las noticias de esta fuente (y del resto) en segundo plano.
    background.add_task(worker.refresh_user, user.id)
    return source


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
        source.name = data.name
    if data.topics is not None:
        source.topics = data.topics.strip()
    if data.active is not None:
        source.active = data.active
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

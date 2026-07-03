"""Feed de noticias: paginación por cursor, orden descendente por fecha."""
import base64
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_
from sqlmodel import Session, select

from . import ingest, llm
from .auth import get_current_user
from .config import settings
from .db import get_session
from .models import Article, Source, User
from .schemas import AnalyzedArticleOut, AnalyzedArticlePage, ArticleOut, ExpandedSummary, FeedPage

router = APIRouter(tags=["feed"])


def _encode_cursor(article: Article) -> str:
    raw = f"{article.published_at.isoformat()}|{article.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, int]:
    raw = base64.urlsafe_b64decode(cursor.encode()).decode()
    iso, id_str = raw.rsplit("|", 1)
    return datetime.fromisoformat(iso), int(id_str)


@router.get("/articles", response_model=FeedPage)
def get_feed(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FeedPage:
    stmt = (
        select(Article, Source.name)
        .join(Source, Article.source_id == Source.id)
        .where(Source.user_id == user.id)
        .where(Article.on_topic == True)  # noqa: E712
        .where(Article.is_duplicate == False)  # noqa: E712
        .where(Article.interesting_score >= settings.interesting_threshold)
        .order_by(Article.published_at.desc(), Article.id.desc())
    )

    if cursor:
        c_time, c_id = _decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                Article.published_at < c_time,
                and_(Article.published_at == c_time, Article.id < c_id),
            )
        )

    rows = session.exec(stmt.limit(limit + 1)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]

    items = [
        ArticleOut(
            id=article.id,
            source_id=article.source_id,
            source_name=source_name,
            title=article.title,
            summary=article.summary,
            image_url=article.image_url,
            link=article.link,
            interesting_score=article.interesting_score,
            published_at=article.published_at,
        )
        for article, source_name in rows
    ]
    next_cursor = _encode_cursor(rows[-1][0]) if has_more and rows else None
    return FeedPage(items=items, next_cursor=next_cursor)


def _encode_analyzed_cursor(article: Article) -> str:
    raw = f"{article.fetched_at.isoformat()}|{article.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_analyzed_cursor(cursor: str) -> tuple[datetime, int]:
    raw = base64.urlsafe_b64decode(cursor.encode()).decode()
    iso, id_str = raw.rsplit("|", 1)
    return datetime.fromisoformat(iso), int(id_str)


def _rejection_reason(article: Article) -> str | None:
    if not article.on_topic:
        return "fuera de tema"
    if article.is_duplicate:
        return "duplicada"
    if article.interesting_score < settings.interesting_threshold:
        return "poco interesante"
    return None


@router.get("/articles/analyzed", response_model=AnalyzedArticlePage)
def list_analyzed_articles(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AnalyzedArticlePage:
    """Todas las noticias analizadas de las fuentes del usuario (también las
    descartadas), con el tema en una palabra y si se aprobaron para el feed."""
    stmt = (
        select(Article, Source.name)
        .join(Source, Article.source_id == Source.id)
        .where(Source.user_id == user.id)
        .order_by(Article.fetched_at.desc(), Article.id.desc())
    )
    if cursor:
        c_time, c_id = _decode_analyzed_cursor(cursor)
        stmt = stmt.where(
            or_(
                Article.fetched_at < c_time,
                and_(Article.fetched_at == c_time, Article.id < c_id),
            )
        )

    rows = session.exec(stmt.limit(limit + 1)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]

    items = [
        AnalyzedArticleOut(
            id=article.id,
            source_id=article.source_id,
            source_name=source_name,
            original_title=article.original_title,
            topic=article.topic,
            interesting_score=article.interesting_score,
            approved=_rejection_reason(article) is None,
            reason=_rejection_reason(article),
            published_at=article.published_at,
            fetched_at=article.fetched_at,
        )
        for article, source_name in rows
    ]
    next_cursor = _encode_analyzed_cursor(rows[-1][0]) if has_more and rows else None
    return AnalyzedArticlePage(items=items, next_cursor=next_cursor)


@router.post("/articles/{article_id}/expand", response_model=ExpandedSummary)
def expand_article(
    article_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ExpandedSummary:
    """Genera (o devuelve cacheado) un resumen más extenso de la noticia."""
    row = session.exec(
        select(Article, Source)
        .join(Source, Article.source_id == Source.id)
        .where(Article.id == article_id, Source.user_id == user.id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Noticia no encontrada")
    article, source = row

    if article.extended_summary:
        return ExpandedSummary(summary=article.extended_summary)

    article_data = ingest.extract_article(article.link)
    extended = llm.expand_summary(
        source.topics,
        article.original_title,
        article_data["text"],
        session=session,
        user_id=user.id,
        source_id=source.id,
        article_id=article.id,
    )
    article.extended_summary = extended
    session.add(article)
    session.commit()
    return ExpandedSummary(summary=extended)

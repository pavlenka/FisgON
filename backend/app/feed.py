"""Feed de noticias: paginación por cursor, orden descendente por fecha."""
import base64
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, update
from sqlmodel import Session, select

from . import ingest, llm, topics
from .auth import get_current_user
from .config import settings
from .db import get_session
from .models import Article, Source, User
from .schemas import (
    AnalyzedArticleOut,
    AnalyzedArticlePage,
    ArticleOut,
    AskRequest,
    AskResponse,
    ExpandedSummary,
    FeedPage,
    ReviewRequest,
)

router = APIRouter(tags=["feed"])

# Una noticia entra en el feed si el usuario la aprobó a mano, o si (sin
# decisión manual) pasa el filtro automático: on-topic, no duplicada y por
# encima del umbral de interés.
_AUTO_OK = and_(
    Article.on_topic == True,  # noqa: E712
    Article.is_duplicate == False,  # noqa: E712
    Article.interesting_score >= settings.interesting_threshold,
)
_VISIBLE = or_(
    Article.manual_approved == True,  # noqa: E712
    and_(Article.manual_approved.is_(None), _AUTO_OK),
)


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
        .where(_VISIBLE)
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
            extended_summary=article.extended_summary,
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


def _auto_reason(article: Article) -> str | None:
    """Motivo del descarte automático (sin decisión manual), o None si pasa."""
    if not article.on_topic:
        return "fuera de tema"
    if article.is_duplicate:
        return "duplicada"
    if article.interesting_score < settings.interesting_threshold:
        return "poco interesante"
    return None


def _effective_status(article: Article, source: Source) -> tuple[bool, str | None]:
    """(aprobada, motivo). La decisión manual prevalece sobre el filtro
    automático; distinguimos el veto de tema de un descarte puntual."""
    if article.manual_approved is True:
        return True, None
    if article.manual_approved is False:
        if topics.has_topic(source.vetoed_topics, article.topic):
            return False, "tema vetado"
        return False, "descartada a mano"
    reason = _auto_reason(article)
    return reason is None, reason


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
        select(Article, Source)
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

    items = []
    for article, source in rows:
        approved, reason = _effective_status(article, source)
        items.append(
            AnalyzedArticleOut(
                id=article.id,
                source_id=article.source_id,
                source_name=source.name,
                original_title=article.original_title,
                topic=article.topic,
                interesting_score=article.interesting_score,
                approved=approved,
                reason=reason,
                topic_vetoed=topics.has_topic(source.vetoed_topics, article.topic),
                published_at=article.published_at,
                fetched_at=article.fetched_at,
            )
        )
    next_cursor = _encode_analyzed_cursor(rows[-1][0]) if has_more and rows else None
    return AnalyzedArticlePage(items=items, next_cursor=next_cursor)


@router.post("/articles/{article_id}/review", status_code=status.HTTP_204_NO_CONTENT)
def review_article(
    article_id: int,
    data: ReviewRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    """Aprueba o descarta una noticia a mano. Con apply_to_source, aplica la
    misma decisión a todas las noticias de ese tema en la fuente y actualiza
    la lista de temas vetados/aceptados de la fuente."""
    row = session.exec(
        select(Article, Source)
        .join(Source, Article.source_id == Source.id)
        .where(Article.id == article_id, Source.user_id == user.id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Noticia no encontrada")
    article, source = row

    article.manual_approved = data.approved
    session.add(article)

    if data.apply_to_source and article.topic:
        topic = article.topic
        if data.approved:
            # Aceptar el tema: quitarlo de vetados y añadirlo a los temas de la
            # fuente para que las futuras se clasifiquen on-topic.
            source.vetoed_topics = topics.remove_topic(source.vetoed_topics, topic)
            source.topics = topics.add_topic(source.topics, topic)
        else:
            source.vetoed_topics = topics.add_topic(source.vetoed_topics, topic)
        session.add(source)
        # Propagar la decisión al resto de noticias del mismo tema y fuente.
        session.exec(
            update(Article)
            .where(Article.source_id == source.id, Article.topic == topic)
            .values(manual_approved=data.approved)
        )

    session.commit()


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


@router.post("/articles/{article_id}/ask", response_model=AskResponse)
def ask_article(
    article_id: int,
    data: AskRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AskResponse:
    """Responde una pregunta concreta del usuario sobre el contexto de la noticia."""
    question = data.question.strip()
    if not question:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Escribe una pregunta")
    if len(question) > 500:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La pregunta es demasiado larga (máx. 500 caracteres)")

    row = session.exec(
        select(Article, Source)
        .join(Source, Article.source_id == Source.id)
        .where(Article.id == article_id, Source.user_id == user.id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Noticia no encontrada")
    article, source = row

    article_data = ingest.extract_article(article.link)
    # Si la web ya no permite extraer el texto, usamos lo que tenemos guardado.
    text = article_data["text"] or article.extended_summary or article.summary
    answer = llm.answer_question(
        source.topics,
        article.original_title,
        text,
        question,
        session=session,
        user_id=user.id,
        source_id=source.id,
        article_id=article.id,
    )
    return AskResponse(answer=answer)

"""Modelos de datos (tablas SQLite)."""
from datetime import datetime, timezone

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """UTC sin tzinfo: SQLite compara fechas como texto, así evitamos mezclar
    valores con y sin zona (importante para el cursor del feed)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=utcnow)


class Source(SQLModel, table=True):
    """Una web de noticias que sigue un usuario, con su tema para el filtro."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    site_url: str
    feed_url: str
    name: str
    # Temas separados por coma, p.ej. "motor,coches,motos". Ancla el filtro on-topic.
    topics: str
    active: bool = True
    created_at: datetime = Field(default_factory=utcnow)
    last_fetched_at: datetime | None = None


class Article(SQLModel, table=True):
    """Noticia ya procesada por la IA. Se guardan todas (también las descartadas)
    para no reprocesarlas; el feed filtra por on_topic + umbral."""

    __table_args__ = (UniqueConstraint("source_id", "guid", name="uq_source_guid"),)

    id: int | None = Field(default=None, primary_key=True)
    source_id: int = Field(index=True, foreign_key="source.id")
    guid: str
    link: str
    original_title: str
    title: str  # titular reescrito, anti-clickbait
    summary: str  # resumen que "destripa" la noticia
    extended_summary: str | None = None  # generado bajo demanda, más detallado
    image_url: str | None = None
    interesting_score: int  # 1-10
    on_topic: bool
    published_at: datetime = Field(index=True)
    fetched_at: datetime = Field(default_factory=utcnow)

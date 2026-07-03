"""Modelos de datos (tablas SQLite)."""
from datetime import datetime, timezone

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """UTC sin tzinfo: SQLite compara fechas como texto, así evitamos mezclar
    valores con y sin zona (importante para el cursor del feed)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# Este correo es siempre administrador, se cree la cuenta cuando se cree
# (ver auth.register y db.init_db, que lo refuerza en cada arranque).
ADMIN_EMAIL = "pavlenka@gmail.com"


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    name: str
    password_hash: str
    # La cuenta no puede iniciar sesión hasta confirmar el correo.
    email_verified: bool = False
    verify_token: str | None = Field(default=None, index=True)
    reset_token: str | None = Field(default=None, index=True)
    reset_token_expires: datetime | None = None
    is_admin: bool = False
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
    # Cuántos días hacia atrás se ingieren noticias de esta fuente (no afecta a lo ya guardado).
    max_age_days: int = 7
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
    # La misma historia ya publicada por otra fuente del usuario: se guarda
    # (para no reprocesarla) pero no se muestra en el feed.
    is_duplicate: bool = False
    published_at: datetime = Field(index=True)
    fetched_at: datetime = Field(default_factory=utcnow)


class ApiCallLog(SQLModel, table=True):
    """Registro de cada llamada al proveedor de IA (Ollama u OpenCode), para el
    dashboard de uso/coste."""

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    kind: str = Field(index=True)  # detect_topics | analyze_article | expand_summary
    provider: str
    model: str
    source_id: int | None = Field(default=None, foreign_key="source.id")
    article_id: int | None = Field(default=None, foreign_key="article.id")
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    cost: float | None = None
    duration_ms: int | None = None
    success: bool = True
    error: str | None = None
    created_at: datetime = Field(default_factory=utcnow, index=True)

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
    # Preferencias del usuario (editables en Cuenta > Preferencias).
    pref_favorite_extended: bool = True  # generar informe al marcar favorita
    pref_favorite_images: bool = True  # buscar fotos al marcar favorita
    pref_email_extended: bool = True  # generar informe al enviar por correo
    pref_extended_open: bool = True  # informe desplegado por defecto en las tarjetas
    pref_theme: str = "dark"  # tema de color: dark | light
    pref_accent: str = "amber"  # color de acento: amber | red | green | blue
    # Última vez que se le vio (request autenticada). El barrido periódico no
    # actualiza las noticias de usuarios inactivos.
    last_seen_at: datetime | None = None
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
    # Temas concretos vetados por el usuario (una palabra, separados por coma).
    # Las noticias de estos temas se descartan aunque sean on-topic.
    vetoed_topics: str = ""
    active: bool = True
    # Si la fuente aparece en el feed inicial ("Feed"); con el chip "Todas"
    # se ven también las excluidas.
    in_feed: bool = True
    # Veces que el usuario ha filtrado el feed por esta fuente: las más
    # filtradas aparecen primero en los chips del feed.
    filter_count: int = 0
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
    topic: str | None = None  # tema concreto de la noticia en una palabra, lo decide la IA
    extended_summary: str | None = None  # generado bajo demanda, más detallado
    image_url: str | None = None
    interesting_score: int  # 1-10
    on_topic: bool
    # La misma historia ya publicada por otra fuente del usuario: se guarda
    # (para no reprocesarla) pero no se muestra en el feed.
    is_duplicate: bool = False
    # Decisión manual del usuario que prevalece sobre el filtro automático:
    # None = automático, True = aprobada a mano, False = descartada a mano.
    manual_approved: bool | None = None
    # Favorita del usuario: al marcarla se genera el informe extenso y se
    # extraen más fotos del artículo (extra_images, lista JSON de URLs).
    is_favorite: bool = False
    extra_images: str | None = None
    # Leída: se marca sola al pasar la tarjeta entera en el feed, o a mano.
    # Las no leídas se muestran con un marco de color.
    is_read: bool = False
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


class InviteToken(SQLModel, table=True):
    """Token de invitación generado por el admin para registrar nuevos usuarios."""

    id: int | None = Field(default=None, primary_key=True)
    token: str = Field(unique=True, index=True)
    # Si se especifica, solo ese correo puede usar la invitación.
    email: str | None = None
    created_by_id: int = Field(foreign_key="user.id")
    # Cuando se usa: se rellena y la invitación queda consumida.
    used_at: datetime | None = None
    used_by_email: str | None = None
    expires_at: datetime = Field()
    created_at: datetime = Field(default_factory=utcnow)

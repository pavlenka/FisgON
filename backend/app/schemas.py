"""Esquemas Pydantic para las peticiones y respuestas de la API."""
from datetime import datetime

from pydantic import BaseModel


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    is_admin: bool
    pref_favorite_extended: bool
    pref_favorite_images: bool
    pref_email_extended: bool
    pref_extended_open: bool


class UserAdminOut(BaseModel):
    id: int
    email: str
    name: str
    is_admin: bool
    email_verified: bool
    source_count: int
    last_seen_at: datetime | None
    created_at: datetime


class UserUpdate(BaseModel):
    # Actualización parcial: solo se toca lo que venga en la petición.
    name: str | None = None
    pref_favorite_extended: bool | None = None
    pref_favorite_images: bool | None = None
    pref_email_extended: bool | None = None
    pref_extended_open: bool | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class Message(BaseModel):
    message: str


class VerifyRequest(BaseModel):
    token: str


class EmailRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SourceDetectRequest(BaseModel):
    url: str


class SourceDetectResponse(BaseModel):
    site_url: str
    feed_url: str
    name: str
    suggested_topics: str


class SourceCreate(BaseModel):
    site_url: str
    feed_url: str
    name: str
    topics: str
    max_age_days: int = 7
    summary_paragraphs: int = 1


class SourceUpdate(BaseModel):
    name: str | None = None
    site_url: str | None = None
    feed_url: str | None = None
    topics: str | None = None
    vetoed_topics: str | None = None
    active: bool | None = None
    max_age_days: int | None = None
    summary_paragraphs: int | None = None


class SourceOut(BaseModel):
    id: int
    site_url: str
    feed_url: str
    name: str
    topics: str
    vetoed_topics: str
    active: bool
    max_age_days: int
    summary_paragraphs: int
    # Veces que se ha filtrado el feed por esta fuente (ordena los chips).
    filter_count: int
    last_fetched_at: datetime | None


class ArticleOut(BaseModel):
    id: int
    source_id: int
    source_name: str
    title: str
    summary: str
    # Ya generado y cacheado en BD (o None): así el frontend lo muestra tras
    # recargar la página sin volver a pedirlo.
    extended_summary: str | None
    image_url: str | None
    link: str
    interesting_score: int
    is_favorite: bool
    # Fotos adicionales del artículo, extraídas al marcarla favorita.
    extra_images: list[str]
    is_read: bool
    published_at: datetime


class FeedPage(BaseModel):
    items: list[ArticleOut]
    next_cursor: str | None = None


class ExpandedSummary(BaseModel):
    summary: str


class FavoriteRequest(BaseModel):
    favorite: bool


class ReadRequest(BaseModel):
    # En lote: el feed marca varias de golpe al ir pasando tarjetas.
    article_ids: list[int]
    read: bool


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str


class AnalyzedArticleOut(BaseModel):
    id: int
    source_id: int
    source_name: str
    original_title: str
    topic: str | None
    interesting_score: int
    approved: bool
    # Motivo del descarte cuando approved=false ("fuera de tema" | "duplicada" |
    # "poco interesante" | "tema vetado" | "descartada a mano").
    reason: str | None
    # Si el tema de esta noticia está actualmente vetado en su fuente.
    topic_vetoed: bool
    published_at: datetime
    fetched_at: datetime


class ReviewRequest(BaseModel):
    approved: bool
    # Aplicar la decisión a todas las noticias de este tema en la fuente
    # (aprobar el tema o vetarlo para las presentes y futuras).
    apply_to_source: bool = False


class AnalyzedArticlePage(BaseModel):
    items: list[AnalyzedArticleOut]
    next_cursor: str | None = None


class ApiCallLogOut(BaseModel):
    id: int
    kind: str
    provider: str
    model: str
    user_email: str
    user_name: str
    source_id: int | None
    # Nombre de la web sobre la que se hizo la llamada (None si no aplica o se borró).
    source_name: str | None
    article_id: int | None
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    cost: float | None
    duration_ms: int | None
    success: bool
    error: str | None
    created_at: datetime


class ApiCallLogPage(BaseModel):
    items: list[ApiCallLogOut]
    next_cursor: str | None = None


class KindBreakdown(BaseModel):
    kind: str
    calls: int
    total_tokens: int
    cost: float


class DashboardSummary(BaseModel):
    total_calls: int
    total_prompt_tokens: int
    total_completion_tokens: int
    total_tokens: int
    total_cost: float
    success_count: int
    error_count: int
    by_kind: list[KindBreakdown]


class InviteCreate(BaseModel):
    email: str  # destinatario de la invitación


class InviteOut(BaseModel):
    id: int
    token: str
    email: str | None
    used_at: datetime | None
    used_by_email: str | None
    expires_at: datetime
    created_at: datetime


class RegisterWithInvite(BaseModel):
    invite_token: str
    email: str
    password: str
    name: str

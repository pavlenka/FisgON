"""Esquemas Pydantic para las peticiones y respuestas de la API."""
from datetime import datetime

from pydantic import BaseModel


class UserCreate(BaseModel):
    email: str
    password: str
    name: str


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    is_admin: bool


class UserAdminOut(BaseModel):
    id: int
    email: str
    name: str
    is_admin: bool
    email_verified: bool
    created_at: datetime


class UserUpdate(BaseModel):
    name: str


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
    last_fetched_at: datetime | None


class ArticleOut(BaseModel):
    id: int
    source_id: int
    source_name: str
    title: str
    summary: str
    image_url: str | None
    link: str
    interesting_score: int
    published_at: datetime


class FeedPage(BaseModel):
    items: list[ArticleOut]
    next_cursor: str | None = None


class ExpandedSummary(BaseModel):
    summary: str


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

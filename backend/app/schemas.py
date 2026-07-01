"""Esquemas Pydantic para las peticiones y respuestas de la API."""
from datetime import datetime

from pydantic import BaseModel


class UserCreate(BaseModel):
    email: str
    password: str


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


class SourceUpdate(BaseModel):
    name: str | None = None
    topics: str | None = None
    active: bool | None = None


class SourceOut(BaseModel):
    id: int
    site_url: str
    feed_url: str
    name: str
    topics: str
    active: bool
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

"""Dashboard de uso de la API de IA: resumen agregado y listado paginado de llamadas."""
import base64
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, or_
from sqlmodel import Session, select

from .auth import get_current_user
from .db import get_session
from .models import ApiCallLog, User
from .schemas import ApiCallLogOut, ApiCallLogPage, DashboardSummary, KindBreakdown

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _encode_cursor(row: ApiCallLog) -> str:
    raw = f"{row.created_at.isoformat()}|{row.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, int]:
    raw = base64.urlsafe_b64decode(cursor.encode()).decode()
    iso, id_str = raw.rsplit("|", 1)
    return datetime.fromisoformat(iso), int(id_str)


@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DashboardSummary:
    # Volumen bajo esperado (proyecto personal): agregamos en Python en vez de
    # con func.sum/group_by para mantener la consulta simple.
    rows = session.exec(select(ApiCallLog).where(ApiCallLog.user_id == user.id)).all()

    total_calls = len(rows)
    total_prompt = sum(r.prompt_tokens or 0 for r in rows)
    total_completion = sum(r.completion_tokens or 0 for r in rows)
    total_tokens = sum(r.total_tokens or 0 for r in rows)
    total_cost = sum(r.cost or 0.0 for r in rows)
    success_count = sum(1 for r in rows if r.success)

    by_kind_map: dict[str, dict] = {}
    for r in rows:
        agg = by_kind_map.setdefault(r.kind, {"calls": 0, "total_tokens": 0, "cost": 0.0})
        agg["calls"] += 1
        agg["total_tokens"] += r.total_tokens or 0
        agg["cost"] += r.cost or 0.0

    return DashboardSummary(
        total_calls=total_calls,
        total_prompt_tokens=total_prompt,
        total_completion_tokens=total_completion,
        total_tokens=total_tokens,
        total_cost=round(total_cost, 6),
        success_count=success_count,
        error_count=total_calls - success_count,
        by_kind=[
            KindBreakdown(kind=k, calls=v["calls"], total_tokens=v["total_tokens"], cost=round(v["cost"], 6))
            for k, v in sorted(by_kind_map.items())
        ],
    )


@router.get("/calls", response_model=ApiCallLogPage)
def list_calls(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ApiCallLogPage:
    stmt = (
        select(ApiCallLog)
        .where(ApiCallLog.user_id == user.id)
        .order_by(ApiCallLog.created_at.desc(), ApiCallLog.id.desc())
    )
    if cursor:
        c_time, c_id = _decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                ApiCallLog.created_at < c_time,
                and_(ApiCallLog.created_at == c_time, ApiCallLog.id < c_id),
            )
        )

    rows = session.exec(stmt.limit(limit + 1)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]

    items = [ApiCallLogOut(**row.model_dump()) for row in rows]
    next_cursor = _encode_cursor(rows[-1]) if has_more and rows else None
    return ApiCallLogPage(items=items, next_cursor=next_cursor)

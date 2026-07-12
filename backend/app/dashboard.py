"""Dashboard de administración: uso de la API de IA y gestión de usuarios."""
import base64
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, delete, func, or_
from sqlmodel import Session, select

from .auth import get_current_admin
from .db import get_session
from .models import ApiCallLog, Article, Source, User
from .schemas import ApiCallLogOut, ApiCallLogPage, DashboardSummary, KindBreakdown, UserAdminOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _encode_cursor(row: ApiCallLog) -> str:
    raw = f"{row.created_at.isoformat()}|{row.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, int]:
    raw = base64.urlsafe_b64decode(cursor.encode()).decode()
    iso, id_str = raw.rsplit("|", 1)
    return datetime.fromisoformat(iso), int(id_str)


@router.get("/users", response_model=list[UserAdminOut])
def list_users(
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> list[UserAdminOut]:
    users = session.exec(select(User).order_by(User.created_at)).all()
    counts = dict(
        session.exec(select(Source.user_id, func.count(Source.id)).group_by(Source.user_id)).all()
    )
    return [UserAdminOut(**u.model_dump(), source_count=counts.get(u.id, 0)) for u in users]


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> None:
    """Elimina un usuario con todo lo suyo: fuentes, noticias y registro de llamadas."""
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes eliminar tu propia cuenta")
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")

    source_ids = session.exec(select(Source.id).where(Source.user_id == user_id)).all()
    if source_ids:
        session.exec(delete(Article).where(Article.source_id.in_(source_ids)))
        session.exec(delete(Source).where(Source.id.in_(source_ids)))
    session.exec(delete(ApiCallLog).where(ApiCallLog.user_id == user_id))
    session.delete(user)
    session.commit()


@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> DashboardSummary:
    # Vista de administrador: agrega las llamadas de TODOS los usuarios.
    # Volumen bajo esperado (proyecto personal): agregamos en Python en vez de
    # con func.sum/group_by para mantener la consulta simple.
    rows = session.exec(select(ApiCallLog)).all()

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
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> ApiCallLogPage:
    # Vista de administrador: llamadas de TODOS los usuarios, con quién hizo
    # cada una y sobre qué web (outerjoin: la fuente puede haberse borrado).
    stmt = (
        select(ApiCallLog, User, Source.name)
        .join(User, User.id == ApiCallLog.user_id)
        .outerjoin(Source, Source.id == ApiCallLog.source_id)
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

    items = [
        ApiCallLogOut(
            **call.model_dump(),
            user_email=call_user.email,
            user_name=call_user.name,
            source_name=source_name,
        )
        for call, call_user, source_name in rows
    ]
    next_cursor = _encode_cursor(rows[-1][0]) if has_more and rows else None
    return ApiCallLogPage(items=items, next_cursor=next_cursor)


# ---------- Invitaciones ----------

from datetime import timedelta
import secrets as _secrets

from . import mailer as _mailer
from .models import InviteToken
from .schemas import InviteCreate, InviteOut

INVITE_TTL_DAYS = 7


@router.get("/invites", response_model=list[InviteOut])
def list_invites(
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> list[InviteOut]:
    from .models import utcnow
    invites = session.exec(select(InviteToken).order_by(InviteToken.created_at.desc())).all()
    return [InviteOut(**i.model_dump()) for i in invites]


@router.post("/invites", response_model=InviteOut)
def create_invite(
    data: InviteCreate,
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> InviteOut:
    from .models import utcnow
    invite = InviteToken(
        token=_secrets.token_urlsafe(32),
        email=data.email.strip().lower() or None,
        created_by_id=admin.id,
        expires_at=utcnow() + timedelta(days=INVITE_TTL_DAYS),
    )
    session.add(invite)
    session.commit()
    session.refresh(invite)
    _mailer.send_invite(data.email.strip(), invite.token)
    return InviteOut(**invite.model_dump())


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(
    invite_id: int,
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> None:
    invite = session.get(InviteToken, invite_id)
    if invite is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitación no encontrada")
    if invite.used_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La invitación ya fue usada, no se puede revocar")
    session.delete(invite)
    session.commit()

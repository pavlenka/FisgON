"""Agenda sencilla de destinatarios para compartir noticias."""
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from .auth import get_current_user
from .db import get_session
from .models import Contact, User
from .schemas import ContactCreate, ContactOut, ContactUpdate

router = APIRouter(prefix="/contacts", tags=["contacts"])


def _validate_destination(channel: str, destination: str) -> str:
    value = destination.strip()
    if not value:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indica un correo, teléfono o usuario")
    if channel == "email" and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El correo no es válido")
    if channel == "whatsapp":
        value = re.sub(r"[\s()+.-]", "", value)
        if not value.isdigit() or len(value) < 7 or len(value) > 15:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Usa el teléfono de WhatsApp con prefijo internacional",
            )
    if channel == "telegram":
        value = value.removeprefix("@").strip()
        if not re.fullmatch(r"[A-Za-z0-9_]{5,32}", value):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "El usuario de Telegram no es válido")
    return value


def _get_owned_contact(contact_id: int, user: User, session: Session) -> Contact:
    contact = session.get(Contact, contact_id)
    if contact is None or contact.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contacto no encontrado")
    return contact


@router.get("", response_model=list[ContactOut])
def list_contacts(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[Contact]:
    return session.exec(
        select(Contact).where(Contact.user_id == user.id).order_by(Contact.name)
    ).all()


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
def create_contact(
    data: ContactCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Contact:
    name = data.name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El nombre no puede estar vacío")
    contact = Contact(
        user_id=user.id,
        name=name,
        channel=data.channel,
        destination=_validate_destination(data.channel, data.destination),
    )
    session.add(contact)
    session.commit()
    session.refresh(contact)
    return contact


@router.patch("/{contact_id}", response_model=ContactOut)
def update_contact(
    contact_id: int,
    data: ContactUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Contact:
    contact = _get_owned_contact(contact_id, user, session)
    if data.name is not None:
        if not data.name.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "El nombre no puede estar vacío")
        contact.name = data.name.strip()
    channel = data.channel or contact.channel
    destination = data.destination if data.destination is not None else contact.destination
    contact.channel = channel
    contact.destination = _validate_destination(channel, destination)
    session.add(contact)
    session.commit()
    session.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(
    contact_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    session.delete(_get_owned_contact(contact_id, user, session))
    session.commit()
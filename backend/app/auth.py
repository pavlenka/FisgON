"""Autenticación: registro con verificación por correo, login, JWT,
reseteo de contraseña y dependencia de usuario actual."""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlmodel import Session, select

from . import mailer
from .config import settings
from .db import get_session
from .models import User, utcnow
from .schemas import (
    EmailRequest,
    Message,
    PasswordChange,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserLogin,
    UserOut,
    UserUpdate,
    VerifyRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

MIN_PASSWORD_LENGTH = 8


def hash_password(password: str) -> str:
    # bcrypt trabaja sobre los primeros 72 bytes; truncamos para evitar errores
    return pwd_context.hash(password[:72])


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password[:72], password_hash)


def create_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


@router.post("/register", response_model=Message)
def register(
    data: UserCreate,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
) -> Message:
    if not data.email or not data.password or not data.name.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nombre, email y contraseña obligatorios")
    if len(data.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres",
        )
    existing = session.exec(select(User).where(User.email == data.email)).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El email ya está registrado")
    user = User(
        email=data.email,
        name=data.name.strip(),
        password_hash=hash_password(data.password),
        verify_token=secrets.token_urlsafe(32),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    background.add_task(mailer.send_verification, user.email, user.name, user.verify_token)
    return Message(message="Cuenta creada. Revisa tu correo para activarla.")


@router.post("/verify", response_model=Message)
def verify_email(data: VerifyRequest, session: Session = Depends(get_session)) -> Message:
    user = session.exec(select(User).where(User.verify_token == data.token)).first()
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El enlace no es válido o ya se ha usado")
    user.email_verified = True
    user.verify_token = None
    session.add(user)
    session.commit()
    return Message(message="Correo verificado. Ya puedes iniciar sesión.")


@router.post("/resend-verification", response_model=Message)
def resend_verification(
    data: EmailRequest,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
) -> Message:
    user = session.exec(select(User).where(User.email == data.email)).first()
    # Respuesta idéntica exista o no la cuenta: no revelamos qué correos están registrados.
    if user is not None and not user.email_verified:
        user.verify_token = secrets.token_urlsafe(32)
        session.add(user)
        session.commit()
        background.add_task(mailer.send_verification, user.email, user.name, user.verify_token)
    return Message(message="Si la cuenta existe y está pendiente, hemos reenviado el correo.")


@router.post("/login", response_model=Token)
def login(data: UserLogin, session: Session = Depends(get_session)) -> Token:
    user = session.exec(select(User).where(User.email == data.email)).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales inválidas")
    if not user.email_verified:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Tu correo aún no está verificado. Revisa tu bandeja de entrada (y el spam).",
        )
    return Token(access_token=create_token(user.id))


RESET_TOKEN_TTL = timedelta(hours=1)


@router.post("/forgot-password", response_model=Message)
def forgot_password(
    data: EmailRequest,
    background: BackgroundTasks,
    session: Session = Depends(get_session),
) -> Message:
    user = session.exec(select(User).where(User.email == data.email)).first()
    if user is not None:
        user.reset_token = secrets.token_urlsafe(32)
        user.reset_token_expires = utcnow() + RESET_TOKEN_TTL
        session.add(user)
        session.commit()
        background.add_task(mailer.send_password_reset, user.email, user.name, user.reset_token)
    return Message(message="Si el correo existe, te hemos enviado un enlace para restablecer la contraseña.")


@router.post("/reset-password", response_model=Message)
def reset_password(data: ResetPasswordRequest, session: Session = Depends(get_session)) -> Message:
    user = session.exec(select(User).where(User.reset_token == data.token)).first()
    if user is None or user.reset_token_expires is None or user.reset_token_expires < utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El enlace no es válido o ha caducado")
    if len(data.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres",
        )
    user.password_hash = hash_password(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    session.add(user)
    session.commit()
    return Message(message="Contraseña restablecida. Ya puedes iniciar sesión.")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    cred_exc = HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "No autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise cred_exc
    user = session.get(User, user_id)
    if user is None:
        raise cred_exc
    return user


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    data: UserUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> User:
    if not data.name.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El nombre no puede estar vacío")
    user.name = data.name.strip()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    data: PasswordChange,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña actual no es correcta")
    if len(data.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"La nueva contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres",
        )
    user.password_hash = hash_password(data.new_password)
    session.add(user)
    session.commit()

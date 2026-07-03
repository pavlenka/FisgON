"""Motor de base de datos y sesión (SQLite vía SQLModel)."""
from collections.abc import Iterator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from .config import settings

# check_same_thread=False permite usar la conexión desde el threadpool de FastAPI
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    """Crea las tablas si no existen. Importa los modelos para registrarlos."""
    from . import models  # noqa: F401  (registra las tablas en SQLModel.metadata)
    from .models import ADMIN_EMAIL

    SQLModel.metadata.create_all(engine)

    with engine.connect() as conn:
        # create_all no añade columnas a tablas ya existentes: si la BD viene
        # de antes de `is_admin`, la añadimos a mano.
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(user)"))}
        if "is_admin" not in cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))
        # pavlenka@gmail.com es admin siempre, aunque se editara la BD a mano.
        conn.execute(text("UPDATE user SET is_admin = 1 WHERE email = :email"), {"email": ADMIN_EMAIL})
        conn.commit()


def get_session() -> Iterator[Session]:
    """Dependencia de FastAPI: una sesión por request."""
    with Session(engine) as session:
        yield session

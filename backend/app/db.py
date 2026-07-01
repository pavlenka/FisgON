"""Motor de base de datos y sesión (SQLite vía SQLModel)."""
from collections.abc import Iterator

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

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """Dependencia de FastAPI: una sesión por request."""
    with Session(engine) as session:
        yield session

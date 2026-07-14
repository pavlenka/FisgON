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
        # de antes de estas columnas, las añadimos a mano.
        user_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(user)"))}
        if "is_admin" not in user_cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))
        if "last_seen_at" not in user_cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN last_seen_at TIMESTAMP"))
            # Los usuarios existentes cuentan como recién vistos: así el barrido
            # periódico no deja de actualizar a nadie hasta que pasen los días
            # de inactividad de verdad.
            conn.execute(text("UPDATE user SET last_seen_at = :now"), {"now": models.utcnow()})
        for pref in ("pref_favorite_extended", "pref_favorite_images", "pref_email_extended", "pref_extended_open"):
            if pref not in user_cols:
                conn.execute(text(f"ALTER TABLE user ADD COLUMN {pref} BOOLEAN NOT NULL DEFAULT 1"))
        source_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(source)"))}
        if "vetoed_topics" not in source_cols:
            conn.execute(text("ALTER TABLE source ADD COLUMN vetoed_topics TEXT NOT NULL DEFAULT ''"))
        if "filter_count" not in source_cols:
            conn.execute(text("ALTER TABLE source ADD COLUMN filter_count INTEGER NOT NULL DEFAULT 0"))
        article_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(article)"))}
        if "topic" not in article_cols:
            conn.execute(text("ALTER TABLE article ADD COLUMN topic TEXT"))
        if "manual_approved" not in article_cols:
            conn.execute(text("ALTER TABLE article ADD COLUMN manual_approved BOOLEAN"))
        if "is_favorite" not in article_cols:
            conn.execute(text("ALTER TABLE article ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT 0"))
        if "extra_images" not in article_cols:
            conn.execute(text("ALTER TABLE article ADD COLUMN extra_images TEXT"))
        if "is_read" not in article_cols:
            # Las noticias que ya estaban en la BD nacen leídas: si no, tras el
            # despliegue todo el feed aparecería con el marco de "no leída".
            conn.execute(text("ALTER TABLE article ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT 0"))
            conn.execute(text("UPDATE article SET is_read = 1"))
        # pavlenka@gmail.com es admin siempre, aunque se editara la BD a mano.
        conn.execute(text("UPDATE user SET is_admin = 1 WHERE email = :email"), {"email": ADMIN_EMAIL})
        conn.commit()


def get_session() -> Iterator[Session]:
    """Dependencia de FastAPI: una sesión por request."""
    with Session(engine) as session:
        yield session

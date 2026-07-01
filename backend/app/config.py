"""Configuración de la aplicación leída de variables de entorno / .env."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Ollama
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "gemma4:latest"

    # Seguridad / JWT
    jwt_secret: str = "cambia-esta-clave-por-una-larga-y-aleatoria"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 días

    # Filtro de noticias: solo se muestran las que superan este umbral (1-10)
    interesting_threshold: int = 6

    # Ingesta en segundo plano
    poll_minutes: int = 20
    max_entries_per_source: int = 25
    article_max_chars: int = 4000

    # Base de datos
    database_url: str = "sqlite:///./fisgon.db"


settings = Settings()

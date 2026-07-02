"""Configuración de la aplicación leída de variables de entorno / .env."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Proveedor de IA: "ollama" (local) u "opencode" (API OpenAI-compatible, para
    # despliegues donde no hay Ollama disponible, p.ej. un VPS).
    llm_provider: str = "ollama"

    # Ollama
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "gemma4:latest"

    # OpenCode Go (https://opencode.ai/docs/go/) — API OpenAI-compatible
    opencode_base_url: str = "https://opencode.ai/zen/go/v1"
    opencode_api_key: str | None = None
    opencode_model: str = "deepseek-v4-flash"

    # Seguridad / JWT
    jwt_secret: str = "cambia-esta-clave-por-una-larga-y-aleatoria"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 días

    # Correo saliente (verificación de cuenta y reseteo de contraseña).
    # La contraseña vive solo en .env; sin ella no se envían correos.
    smtp_host: str = "mail.privateemail.com"
    smtp_port: int = 465
    smtp_user: str = "info@prasoft.es"
    smtp_from: str = "info@prasoft.es"
    smtp_password: str | None = None
    # Base para construir los enlaces de los correos (en prod: https://prasoft.es/fisgon)
    app_base_url: str = "http://localhost:5173"

    # Filtro de noticias: solo se muestran las que superan este umbral (1-10)
    interesting_threshold: int = 6

    # Ingesta en segundo plano
    poll_minutes: int = 20
    max_entries_per_source: int = 25
    article_max_chars: int = 4000

    # Base de datos
    database_url: str = "sqlite:///./fisgon.db"


settings = Settings()

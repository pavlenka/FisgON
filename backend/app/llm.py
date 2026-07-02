"""Capa de IA: detección de tema y análisis anti-clickbait.

Todo el razonamiento (¿es del tema?, ¿es interesante?, resumen honesto) lo hace
un modelo, forzando salida JSON para respuestas estables. Soporta dos proveedores
intercambiables vía LLM_PROVIDER:
  - "ollama": modelo local (por defecto, para desarrollo).
  - "opencode": API OpenAI-compatible de OpenCode Go, para entornos sin Ollama
    (p.ej. un VPS de despliegue).

Cada llamada se registra en ApiCallLog (dashboard de uso/coste) desde el único
punto de paso común, _chat().
"""
import json
import logging
import re
import time

import httpx
from ollama import Client
from sqlmodel import Session

from .config import settings
from .models import ApiCallLog

log = logging.getLogger("fisgon.llm")

_ollama_client = Client(host=settings.ollama_host)

# Precios de OpenCode Go en USD por millón de tokens. El campo "cost" que
# devuelve la API ha sido siempre "0" en la práctica (no fiable), así que el
# coste del dashboard se calcula aquí a partir de tokens reales x precio real.
_OPENCODE_PRICING: dict[str, dict[str, float]] = {
    "glm-5.2": {"input": 1.40, "output": 4.40},
    "glm-5.1": {"input": 1.40, "output": 4.40},
    "kimi-k2.7-code": {"input": 0.95, "output": 4.00},
    "kimi-k2.6": {"input": 0.95, "output": 4.00},
    "mimo-v2.5": {"input": 0.14, "output": 0.28},
    "mimo-v2.5-pro": {"input": 1.74, "output": 3.48},
    "minimax-m3": {"input": 0.30, "output": 1.20},
    "minimax-m2.7": {"input": 0.30, "output": 1.20},
    "minimax-m2.5": {"input": 0.30, "output": 1.20},
    "qwen3.7-max": {"input": 2.50, "output": 7.50},
    "deepseek-v4-pro": {"input": 1.74, "output": 3.48},
    "deepseek-v4-flash": {"input": 0.14, "output": 0.28},
}
# Qwen Plus cambia de precio según el contexto total de la llamada (prompt).
_OPENCODE_PRICING_TIERED: dict[str, dict[str, dict[str, float]]] = {
    "qwen3.7-plus": {
        "low": {"input": 0.40, "output": 1.60},
        "high": {"input": 1.20, "output": 4.80},
    },
    "qwen3.6-plus": {
        "low": {"input": 0.50, "output": 3.00},
        "high": {"input": 2.00, "output": 6.00},
    },
}
_TIER_THRESHOLD_TOKENS = 256_000


def _estimate_opencode_cost(
    model: str, prompt_tokens: int | None, completion_tokens: int | None
) -> float | None:
    """Coste estimado en USD para una llamada a OpenCode, o None si no
    conocemos el precio de ese modelo."""
    if prompt_tokens is None or completion_tokens is None:
        return None
    pricing = _OPENCODE_PRICING.get(model)
    if pricing is None and model in _OPENCODE_PRICING_TIERED:
        tier = "high" if prompt_tokens > _TIER_THRESHOLD_TOKENS else "low"
        pricing = _OPENCODE_PRICING_TIERED[model][tier]
    if pricing is None:
        return None
    cost = (prompt_tokens / 1_000_000) * pricing["input"] + (completion_tokens / 1_000_000) * pricing["output"]
    return round(cost, 6)


def _strip_code_fence(text: str) -> str:
    """Algunos modelos envuelven el JSON en ```json ... ```; lo quitamos si aparece."""
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    return match.group(1) if match else text


def _log_call(
    session: Session,
    *,
    user_id: int,
    kind: str,
    provider: str,
    model: str,
    source_id: int | None,
    article_id: int | None,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    total_tokens: int | None,
    cost: float | None,
    duration_ms: int,
    success: bool,
    error: str | None,
) -> None:
    """Guarda una fila del dashboard de uso. Nunca debe romper la llamada real."""
    try:
        session.add(
            ApiCallLog(
                user_id=user_id,
                kind=kind,
                provider=provider,
                model=model,
                source_id=source_id,
                article_id=article_id,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                cost=cost,
                duration_ms=duration_ms,
                success=success,
                error=error,
            )
        )
        session.commit()
    except Exception:  # noqa: BLE001 - registrar el uso nunca debe tumbar la llamada real
        log.exception("No se pudo registrar la llamada a la IA en el dashboard")
        session.rollback()


def _chat(
    system: str,
    user: str,
    *,
    json_mode: bool,
    session: Session,
    user_id: int,
    kind: str,
    source_id: int | None = None,
    article_id: int | None = None,
) -> str:
    """Llama al proveedor configurado, registra la llamada y devuelve el texto."""
    provider = settings.llm_provider
    model = settings.opencode_model if provider == "opencode" else settings.ollama_model
    started = time.monotonic()

    try:
        if provider == "opencode":
            with httpx.Client(timeout=90.0) as client:
                payload = {
                    "model": settings.opencode_model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "temperature": 0.2,
                }
                if json_mode:
                    payload["response_format"] = {"type": "json_object"}
                resp = client.post(
                    f"{settings.opencode_base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {settings.opencode_api_key}"},
                    json=payload,
                )
                resp.raise_for_status()
                resp_json = resp.json()
                content = resp_json["choices"][0]["message"]["content"]
                usage = resp_json.get("usage") or {}
                prompt_tokens = usage.get("prompt_tokens")
                completion_tokens = usage.get("completion_tokens")
                total_tokens = usage.get("total_tokens")
                cost = _estimate_opencode_cost(settings.opencode_model, prompt_tokens, completion_tokens)
        else:
            resp = _ollama_client.chat(
                model=settings.ollama_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                format="json" if json_mode else None,
                options={"temperature": 0.2},
            )
            content = resp["message"]["content"]
            prompt_tokens = resp.get("prompt_eval_count")
            completion_tokens = resp.get("eval_count")
            total_tokens = (
                prompt_tokens + completion_tokens
                if prompt_tokens is not None and completion_tokens is not None
                else None
            )
            cost = None
    except Exception as exc:  # noqa: BLE001 - se registra el fallo y se relanza
        duration_ms = int((time.monotonic() - started) * 1000)
        _log_call(
            session,
            user_id=user_id,
            kind=kind,
            provider=provider,
            model=model,
            source_id=source_id,
            article_id=article_id,
            prompt_tokens=None,
            completion_tokens=None,
            total_tokens=None,
            cost=None,
            duration_ms=duration_ms,
            success=False,
            error=str(exc)[:500],
        )
        raise

    duration_ms = int((time.monotonic() - started) * 1000)
    _log_call(
        session,
        user_id=user_id,
        kind=kind,
        provider=provider,
        model=model,
        source_id=source_id,
        article_id=article_id,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        cost=cost,
        duration_ms=duration_ms,
        success=True,
        error=None,
    )
    return content


def _chat_json(
    system: str,
    user: str,
    *,
    session: Session,
    user_id: int,
    kind: str,
    source_id: int | None = None,
    article_id: int | None = None,
) -> dict:
    """Llama al modelo forzando JSON y devuelve el dict parseado ({} si falla)."""
    content = _chat(
        system,
        user,
        json_mode=True,
        session=session,
        user_id=user_id,
        kind=kind,
        source_id=source_id,
        article_id=article_id,
    )
    try:
        return json.loads(_strip_code_fence(content))
    except (json.JSONDecodeError, TypeError):
        log.warning("Respuesta no-JSON del modelo: %r", content[:200])
        return {}


DETECT_SYSTEM = (
    "Eres un clasificador de medios. A partir del nombre de una web de noticias y "
    "una muestra de sus titulares, deduces su temática principal. Respondes solo JSON."
)


def detect_topics(name: str, sample_titles: list[str], *, session: Session, user_id: int) -> str:
    """Devuelve el/los tema(s) de una web como cadena separada por comas."""
    titles = "\n".join(f"- {t}" for t in sample_titles[:15]) or "(sin titulares)"
    user = (
        f"Web: {name}\n\nTitulares recientes:\n{titles}\n\n"
        "Deduce entre 1 y 3 temas principales (en español, en minúscula, palabras cortas; "
        "por ejemplo: motor, tecnología, política, deportes, moda, videojuegos).\n"
        'Responde SOLO JSON con esta forma: {"topics": ["tema1", "tema2"]}'
    )
    data = _chat_json(DETECT_SYSTEM, user, session=session, user_id=user_id, kind="detect_topics")
    topics = data.get("topics")
    if isinstance(topics, list) and topics:
        return ", ".join(str(t).strip().lower() for t in topics if str(t).strip())
    if isinstance(topics, str) and topics.strip():
        return topics.strip().lower()
    return ""


ANALYZE_SYSTEM = (
    "Eres un editor de noticias que combate el clickbait. Para cada noticia decides si "
    "trata realmente sobre el tema indicado, la puntúas por interés informativo y reescribes "
    "un titular claro y un resumen honesto que le ahorre al lector tener que abrir la noticia. "
    "Escribes en español y respondes solo JSON."
)


def analyze_article(
    topics: str, title: str, text: str, *, session: Session, user_id: int, source_id: int
) -> dict:
    """Analiza una noticia y devuelve
    {on_topic: bool, interesting: int(1-10), title: str, summary: str}.

    Ante cualquier fallo devuelve un resultado seguro (on_topic=False) para que la
    noticia quede descartada pero registrada y no se reprocese.
    """
    body = (text or "").strip()[: settings.article_max_chars] or "(sin contenido extraído)"
    user = (
        f"Tema(s) de esta web: {topics}\n"
        "IMPORTANTE: una noticia solo es válida (on_topic=true) si trata sobre esos temas. "
        "Si va de cualquier otra cosa (aunque la publique la misma web), on_topic=false.\n\n"
        f"Titular original: {title}\n\n"
        f"Contenido de la noticia:\n{body}\n\n"
        "Responde SOLO JSON con esta forma exacta:\n"
        "{\n"
        '  "on_topic": true,\n'
        '  "interesting": 7,\n'
        '  "title": "titular claro y factual, sin clickbait",\n'
        '  "summary": "2-3 frases que resuman la noticia para no tener que leerla"\n'
        "}\n"
        "Donde interesting va de 1 (irrelevante) a 10 (imprescindible)."
    )
    data = _chat_json(
        ANALYZE_SYSTEM, user, session=session, user_id=user_id, kind="analyze_article", source_id=source_id
    )

    try:
        interesting = int(data.get("interesting", 0))
    except (TypeError, ValueError):
        interesting = 0
    interesting = max(0, min(10, interesting))

    new_title = str(data.get("title") or title).strip()
    summary = str(data.get("summary") or "").strip()
    on_topic = bool(data.get("on_topic", False))

    return {
        "on_topic": on_topic,
        "interesting": interesting,
        "title": new_title,
        "summary": summary,
    }


EXPAND_SYSTEM = (
    "Eres un editor de noticias que combate el clickbait. Escribes en español un resumen "
    "extenso y honesto de una noticia: más contexto, cifras y datos concretos que un resumen "
    "breve, explicando por qué es relevante. No inventas nada que no esté en el texto."
)


def expand_summary(
    topics: str, title: str, text: str, *, session: Session, user_id: int, source_id: int, article_id: int
) -> str:
    """Resumen más largo (varias frases/párrafos) para quien quiere más detalle sin
    leer el artículo original. No usa JSON: es texto libre."""
    body = (text or "").strip()[: settings.article_max_chars] or "(sin contenido extraído)"
    user = (
        f"Tema(s) de esta web: {topics}\n\n"
        f"Titular: {title}\n\n"
        f"Contenido de la noticia:\n{body}\n\n"
        "Escribe un resumen extenso (6-10 frases, puede ser en dos párrafos) que permita "
        "entender la noticia en profundidad sin tener que abrir el artículo original."
    )
    return _chat(
        EXPAND_SYSTEM,
        user,
        json_mode=False,
        session=session,
        user_id=user_id,
        kind="expand_summary",
        source_id=source_id,
        article_id=article_id,
    ).strip()

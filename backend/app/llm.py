"""Capa de IA: detección de tema y análisis anti-clickbait.

Todo el razonamiento (¿es del tema?, ¿es interesante?, resumen honesto) lo hace
un modelo, forzando salida JSON para respuestas estables. Soporta dos proveedores
intercambiables vía LLM_PROVIDER:
  - "ollama": modelo local (por defecto, para desarrollo).
  - "opencode": API OpenAI-compatible de OpenCode Go, para entornos sin Ollama
    (p.ej. un VPS de despliegue).
"""
import json
import logging
import re

import httpx
from ollama import Client

from .config import settings

log = logging.getLogger("fisgon.llm")

_ollama_client = Client(host=settings.ollama_host)


def _strip_code_fence(text: str) -> str:
    """Algunos modelos envuelven el JSON en ```json ... ```; lo quitamos si aparece."""
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    return match.group(1) if match else text


def _chat(system: str, user: str, *, json_mode: bool) -> str:
    """Llama al proveedor configurado y devuelve el texto de la respuesta."""
    if settings.llm_provider == "opencode":
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
            return resp.json()["choices"][0]["message"]["content"]

    resp = _ollama_client.chat(
        model=settings.ollama_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        format="json" if json_mode else None,
        options={"temperature": 0.2},
    )
    return resp["message"]["content"]


def _chat_json(system: str, user: str) -> dict:
    """Llama al modelo forzando JSON y devuelve el dict parseado ({} si falla)."""
    content = _chat(system, user, json_mode=True)
    try:
        return json.loads(_strip_code_fence(content))
    except (json.JSONDecodeError, TypeError):
        log.warning("Respuesta no-JSON del modelo: %r", content[:200])
        return {}


DETECT_SYSTEM = (
    "Eres un clasificador de medios. A partir del nombre de una web de noticias y "
    "una muestra de sus titulares, deduces su temática principal. Respondes solo JSON."
)


def detect_topics(name: str, sample_titles: list[str]) -> str:
    """Devuelve el/los tema(s) de una web como cadena separada por comas."""
    titles = "\n".join(f"- {t}" for t in sample_titles[:15]) or "(sin titulares)"
    user = (
        f"Web: {name}\n\nTitulares recientes:\n{titles}\n\n"
        "Deduce entre 1 y 3 temas principales (en español, en minúscula, palabras cortas; "
        "por ejemplo: motor, tecnología, política, deportes, moda, videojuegos).\n"
        'Responde SOLO JSON con esta forma: {"topics": ["tema1", "tema2"]}'
    )
    data = _chat_json(DETECT_SYSTEM, user)
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


def analyze_article(topics: str, title: str, text: str) -> dict:
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
    data = _chat_json(ANALYZE_SYSTEM, user)

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


def expand_summary(topics: str, title: str, text: str) -> str:
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
    return _chat(EXPAND_SYSTEM, user, json_mode=False).strip()

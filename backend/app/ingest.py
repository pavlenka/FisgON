"""Ingesta de noticias: descubrir el feed, parsear RSS y extraer el artículo.

- Descubrimiento de feed: la propia URL si ya es un feed, si no el <link rel=alternate>
  de la home, y como último recurso rutas comunes (/feed, /rss, ...).
- Extracción del artículo completo con trafilatura para dar mejor contexto a la IA.
"""
import calendar
import logging
import re
from datetime import datetime
from urllib.parse import urljoin, urlparse

import feedparser
import httpx
import trafilatura

from .config import settings

log = logging.getLogger("fisgon.ingest")

USER_AGENT = "Mozilla/5.0 (compatible; FisgON/1.0; +https://localhost)"
COMMON_FEED_PATHS = [
    "/feed",
    "/rss",
    "/rss.xml",
    "/feed.xml",
    "/index.xml",
    "/atom.xml",
    "/feed/",
    "/rss/",
]


def _http_get(url: str) -> httpx.Response | None:
    try:
        with httpx.Client(
            follow_redirects=True,
            timeout=20.0,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return resp
    except Exception as exc:  # noqa: BLE001 - red poco fiable, degradamos con gracia
        log.info("Fallo al descargar %s: %s", url, exc)
        return None


def _origin(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _normalize_url(raw_url: str) -> str:
    raw_url = raw_url.strip()
    if not raw_url.startswith(("http://", "https://")):
        raw_url = "https://" + raw_url
    return raw_url


def _feed_name(parsed: feedparser.FeedParserDict, fallback_url: str) -> str:
    title = parsed.feed.get("title") if parsed.feed else None
    if title:
        return str(title).strip()
    return urlparse(fallback_url).netloc


def discover_feed(raw_url: str) -> dict | None:
    """Devuelve {site_url, feed_url, name} o None si no encuentra feed."""
    url = _normalize_url(raw_url)
    resp = _http_get(url)
    if resp is None:
        return None

    # ¿La URL ya es un feed?
    parsed = feedparser.parse(resp.content)
    if parsed.entries:
        site = (parsed.feed.get("link") if parsed.feed else None) or _origin(url)
        return {"site_url": site, "feed_url": url, "name": _feed_name(parsed, url)}

    # Buscar <link rel="alternate" type="application/rss+xml|atom+xml"> en la home
    html = resp.text
    for tag in re.findall(r"<link\b[^>]*>", html, flags=re.IGNORECASE):
        low = tag.lower()
        if "application/rss+xml" in low or "application/atom+xml" in low:
            href_match = re.search(r'href=["\']([^"\']+)["\']', tag, flags=re.IGNORECASE)
            if not href_match:
                continue
            feed_url = urljoin(url, href_match.group(1))
            feed_resp = _http_get(feed_url)
            if feed_resp:
                fparsed = feedparser.parse(feed_resp.content)
                if fparsed.entries:
                    return {
                        "site_url": _origin(url),
                        "feed_url": feed_url,
                        "name": _feed_name(fparsed, url),
                    }

    # Último recurso: rutas comunes
    origin = _origin(url)
    for path in COMMON_FEED_PATHS:
        feed_url = origin.rstrip("/") + path
        feed_resp = _http_get(feed_url)
        if feed_resp:
            fparsed = feedparser.parse(feed_resp.content)
            if fparsed.entries:
                return {
                    "site_url": origin,
                    "feed_url": feed_url,
                    "name": _feed_name(fparsed, url),
                }

    return None


def _entry_date(entry: feedparser.FeedParserDict) -> datetime:
    """Fecha de publicación en UTC naive (o ahora si el feed no la trae).

    Algunas fuentes etiquetan su feed como GMT pero en realidad publican en
    hora local (p.ej. CEST, UTC+2 en verano), lo que da fechas varias horas
    en el futuro. Recortamos a "ahora" en ese caso: si no, esa noticia se
    cuela por delante de otras genuinamente más recientes y rompe el orden
    cronológico estricto del feed.
    """
    now = datetime.utcnow()
    for key in ("published_parsed", "updated_parsed"):
        struct = entry.get(key)
        if struct:
            return min(datetime.utcfromtimestamp(calendar.timegm(struct)), now)
    return now


def _entry_image(entry: feedparser.FeedParserDict) -> str | None:
    """Imagen de portada declarada en el propio feed (media:content/thumbnail,
    enclosure o la primera <img> del resumen HTML)."""
    for key in ("media_content", "media_thumbnail"):
        media = entry.get(key)
        if media and media[0].get("url"):
            return media[0]["url"]
    for link in entry.get("links", []):
        if str(link.get("type", "")).startswith("image/") and link.get("href"):
            return link["href"]
    match = re.search(r'<img[^>]+src="([^"]+)"', entry.get("summary", ""))
    return match.group(1) if match else None


def fetch_entries(feed_url: str, limit: int) -> list[dict]:
    """Lista de entradas del feed: {guid, link, title, summary, image, published}."""
    parsed = feedparser.parse(feed_url)
    entries: list[dict] = []
    for entry in parsed.entries[:limit]:
        link = entry.get("link", "")
        guid = entry.get("id") or link
        if not guid:
            continue
        entries.append(
            {
                "guid": guid,
                "link": link,
                "title": entry.get("title", "").strip(),
                "summary": entry.get("summary", "").strip(),
                "image": _entry_image(entry),
                "published": _entry_date(entry),
            }
        )
    return entries


def _og_image(html: str) -> str | None:
    match = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', html)
    if not match:
        match = re.search(r'<meta[^>]+content="([^"]+)"[^>]+property="og:image"', html)
    return match.group(1) if match else None


def extract_article(link: str) -> dict:
    """Descarga el artículo una vez y devuelve {text, image}.

    text: contenido principal (truncado), para dar contexto a la IA.
    image: og:image de la página, como respaldo si el feed no traía imagen.
    """
    if not link:
        return {"text": "", "image": None}
    resp = _http_get(link)
    if resp is None:
        return {"text": "", "image": None}
    text = trafilatura.extract(
        resp.text,
        include_comments=False,
        include_tables=False,
        favor_recall=True,
    )
    return {
        "text": (text or "")[: settings.article_max_chars],
        "image": _og_image(resp.text),
    }

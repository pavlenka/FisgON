"""Utilidades para las listas de temas separadas por coma (topics, vetoed_topics)."""


def parse_topics(raw: str | None) -> list[str]:
    """Lista de temas normalizados (minúscula, sin espacios ni vacíos)."""
    if not raw:
        return []
    seen: list[str] = []
    for part in raw.split(","):
        t = part.strip().lower()
        if t and t not in seen:
            seen.append(t)
    return seen


def add_topic(raw: str | None, topic: str) -> str:
    topics = parse_topics(raw)
    t = topic.strip().lower()
    if t and t not in topics:
        topics.append(t)
    return ", ".join(topics)


def remove_topic(raw: str | None, topic: str) -> str:
    t = topic.strip().lower()
    return ", ".join(x for x in parse_topics(raw) if x != t)


def has_topic(raw: str | None, topic: str | None) -> bool:
    if not topic:
        return False
    return topic.strip().lower() in parse_topics(raw)

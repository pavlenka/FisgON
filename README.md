# 🕵️ FisgON

Agregador de noticias **anti-clickbait** con IA local (Ollama).

Para cada web que sigues, FisgON:

1. **Filtra por tema.** Si añades `motorpasion.com` con el tema *motor*, descarta lo que no
   sea de motor (aunque el grupo editorial sindique noticias de moda o de otras temáticas).
2. **Filtra por interés.** Puntúa cada noticia (1-10) y solo muestra las que superan un umbral.
3. **Reescribe título y resumen** de forma clara y honesta, para que sepas de qué va la noticia
   sin necesidad de entrar a leerla.

El feed se carga con **scroll infinito**, siempre en **orden descendente por fecha**.
Todo el trabajo de IA (detectar el tema de una web, clasificar, puntuar y resumir) lo hace un
modelo local vía **Ollama** — no se envía nada a servicios externos.

## Arquitectura

- **Backend:** FastAPI + SQLite. Descarga los feeds RSS/Atom, extrae el texto del artículo
  (`trafilatura`) y lo pasa por Ollama. Un worker en segundo plano refresca las fuentes cada
  cierto tiempo.
- **Frontend:** React + Vite + TypeScript (TanStack Query para el scroll infinito).
- **IA:** Ollama (`gemma4:latest` por defecto), con salida JSON forzada.

## Requisitos

- [Ollama](https://ollama.com) en marcha con el modelo configurado:
  ```bash
  ollama pull gemma4        # o el que prefieras (ver OLLAMA_MODEL)
  ```
- Python 3.11+ (probado con 3.12).
- Node 18+.

## Puesta en marcha

### 1. Backend

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env          # ajusta JWT_SECRET, OLLAMA_MODEL, etc.
.venv/bin/uvicorn app.main:app --reload --port 8000
```

La API queda en `http://localhost:8000/api` (documentación en `/docs`).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5173`. El dev server hace proxy de `/api` al backend (`:8000`).
Si el backend corre en otro puerto: `VITE_API_PROXY=http://localhost:8010 npm run dev`.

## Uso

1. **Crea tu usuario** (registro con email + contraseña).
2. En **Fuentes**, escribe una web (p.ej. `motorpasion.com`) y pulsa **Detectar**: FisgON
   descubre su feed y **sugiere el tema**, que puedes editar antes de guardar.
3. Pulsa **Actualizar** en **Noticias** para que descargue y procese las últimas noticias.
   El primer procesado tarda un poco (el modelo analiza cada artículo).
4. Lee el feed: títulos y resúmenes claros, orden descendente por hora, scroll infinito.

## Configuración (backend/.env)

| Variable | Por defecto | Descripción |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | `ollama` (local) u `opencode` (API remota, para desplegar donde no hay Ollama) |
| `OLLAMA_HOST` | `http://localhost:11434` | Dónde escucha Ollama |
| `OLLAMA_MODEL` | `gemma4:latest` | Modelo para clasificar/resumir (alternativa: `gpt-oss:latest`) |
| `OPENCODE_API_KEY` | *(vacío)* | Clave de [OpenCode Go](https://opencode.ai/docs/go/), solo si `LLM_PROVIDER=opencode` |
| `OPENCODE_MODEL` | `deepseek-v4-flash` | Modelo económico por defecto en OpenCode Go |
| `JWT_SECRET` | *(cámbialo)* | Clave para firmar los tokens |
| `INTERESTING_THRESHOLD` | `6` | Puntuación mínima (1-10) para mostrar una noticia |
| `POLL_MINUTES` | `20` | Cada cuánto refresca las fuentes en segundo plano |
| `MAX_ENTRIES_PER_SOURCE` | `25` | Cuántas entradas del feed procesa por pasada |
| `ARTICLE_MAX_CHARS` | `4000` | Longitud máxima del texto que se envía al modelo |
| `DATABASE_URL` | `sqlite:///./fisgon.db` | Base de datos |

## Cómo funciona el filtro

Al procesar una noticia, el backend hace **una única llamada** al modelo con el/los tema(s)
de la web y el texto del artículo, y recibe un JSON:

```json
{ "on_topic": true, "interesting": 8,
  "title": "titular claro y factual",
  "summary": "2-3 frases que resumen la noticia" }
```

Se guardan todas las noticias analizadas (también las descartadas, para no reprocesarlas),
pero el feed solo muestra las que tienen `on_topic = true` e `interesting >= INTERESTING_THRESHOLD`.

## Despliegue (fisgon.prasoft.es)

Incluye `docker-compose.yml` con dos servicios (`fisgon-backend` y `fisgon-frontend`)
pensado para engancharse a la red Traefik ya existente en el VPS de
[prasoft.es](https://github.com/pavlenka/prasoft-es-portfolio) (ver su `DEPLOY-README.md`
para la sección "fisgon.prasoft.es"). En este modo se usa `LLM_PROVIDER=opencode`
([OpenCode Go](https://opencode.ai/docs/go/)) en vez de Ollama, ya que el VPS no tiene
un modelo local corriendo.

```bash
cp .env.example .env   # rellena OPENCODE_API_KEY y FISGON_JWT_SECRET
docker compose up -d --build
```

Requiere que la red externa `prasoft_traefik` ya exista (la crea el `docker-compose.yml`
principal de prasoft.es).

## Fuera de alcance (por ahora)

- Deduplicado semántico de una misma noticia entre webs distintas.
- Umbral de interés configurable por usuario.
- Notificaciones y favoritos.

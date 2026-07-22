# Repository guide

FisgON is a Spanish-language anti-clickbait news aggregator. It discovers RSS/Atom feeds, extracts article text, asks an LLM to classify and rewrite articles, and serves a personalized feed.

## Layout

- `backend/app/`: FastAPI application.
  - `main.py` wires the routers and periodic ingestion loop.
  - `auth.py`, `sources.py`, `feed.py`, and `dashboard.py` expose API routes.
  - `worker.py` and `ingest.py` handle feed processing; `llm.py` contains Ollama/OpenCode integration.
  - `models.py` contains SQLModel tables; `schemas.py` contains request/response models.
- `frontend/src/`: React 18 + TypeScript frontend.
  - `pages/` contains route-level screens and `components/` shared UI.
  - `api.ts` is the typed API client; `auth.tsx` owns authentication state.
  - `styles.css` contains the application styling and responsive rules.
- `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, and `frontend/nginx.conf` define production deployment under `/fisgon/`.

## Local development

Run backend commands from `backend/` so `.env` and the default SQLite path resolve correctly:

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Run the frontend separately:

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:8000`. Override this with `VITE_API_PROXY` when needed. Ollama is the default LLM provider and must be running for ingestion/LLM features; ordinary frontend builds do not require it.

## Validation

There is currently no automated test suite or configured linter. For changes, run the narrowest relevant checks plus:

```bash
cd frontend && npm run build
cd backend && .venv/bin/python -m compileall app
```

For backend behavior, start Uvicorn and check `/api/health` and the affected endpoint. Avoid tests that invoke real feeds, email, or LLM providers unless explicitly needed; these depend on network access and local secrets.

## Conventions

- Keep user-facing text and the existing documentation/comment language in Spanish.
- Keep API routes under `/api`; update `frontend/src/api.ts` types and methods whenever an API contract changes.
- Preserve strict TypeScript compatibility and the existing functional React style.
- Use timezone-normalized datetimes consistently with `models.utcnow`; feed cursor ordering depends on them.
- Treat model changes as SQLite migration work. `SQLModel.metadata.create_all()` only creates missing tables, while `db.py` contains compatibility migrations for existing databases.
- Keep changes focused and follow nearby formatting. Do not edit generated/local artifacts such as `frontend/dist/`, `frontend/node_modules/`, `backend/.venv/`, `*.db`, or `.env` files.
- Never commit JWT secrets, SMTP credentials, OpenCode keys, user data, or other environment-specific values.

## Deployment notes

Production is served at `prasoft.es/fisgon`, not at the domain root. The frontend is built with Vite's `/fisgon/` base, and nginx rewrites `/fisgon/api/` to the backend's `/api/`. Check both local-root and subpath URL behavior when changing routing, asset paths, proxying, or API URL construction.
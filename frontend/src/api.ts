// Cliente de la API de FisgON. El token JWT se guarda en localStorage y se envía
// en la cabecera Authorization. Todas las rutas pasan por el proxy /api de Vite.
//
// BASE_URL es "/" en local y "/fisgon/" cuando se compila con --base=/fisgon/
// (despliegue bajo prasoft.es/fisgon), así el cliente pega a la ruta correcta
// en ambos casos sin configuración aparte.
const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, "/");

const TOKEN_KEY = "fisgon_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Cuando cualquier petición recibe un 401, avisamos a quien se haya suscrito
// (AuthProvider) para que la app vuelva limpiamente a la pantalla de login en
// vez de quedarse en un estado roto (token borrado pero UI "logueada").
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
  }
  if (!res.ok) {
    let detail = `Error ${res.status}`;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
}

export interface Source {
  id: number;
  site_url: string;
  feed_url: string;
  name: string;
  topics: string;
  active: boolean;
  max_age_days: number;
  last_fetched_at: string | null;
}

export interface DetectResult {
  site_url: string;
  feed_url: string;
  name: string;
  suggested_topics: string;
}

export interface Article {
  id: number;
  source_id: number;
  source_name: string;
  title: string;
  summary: string;
  image_url: string | null;
  link: string;
  interesting_score: number;
  published_at: string;
}

export interface FeedPage {
  items: Article[];
  next_cursor: string | null;
}

export interface RefreshStatus {
  processing: boolean;
  new: number;
  error?: boolean;
}

export interface ApiCallLogRow {
  id: number;
  kind: string;
  provider: string;
  model: string;
  source_id: number | null;
  article_id: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost: number | null;
  duration_ms: number | null;
  success: boolean;
  error: string | null;
  created_at: string;
}

export interface ApiCallLogPage {
  items: ApiCallLogRow[];
  next_cursor: string | null;
}

export interface KindBreakdown {
  kind: string;
  calls: number;
  total_tokens: number;
  cost: number;
}

export interface DashboardSummary {
  total_calls: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost: number;
  success_count: number;
  error_count: number;
  by_kind: KindBreakdown[];
}

export const api = {
  register: (email: string, password: string, name: string) =>
    apiFetch("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }) as Promise<{
      access_token: string;
    }>,
  login: (email: string, password: string) =>
    apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }) as Promise<{
      access_token: string;
    }>,
  me: () => apiFetch("/auth/me") as Promise<AuthUser>,
  detect: (url: string) =>
    apiFetch("/sources/detect", { method: "POST", body: JSON.stringify({ url }) }) as Promise<DetectResult>,
  listSources: () => apiFetch("/sources") as Promise<Source[]>,
  createSource: (s: { site_url: string; feed_url: string; name: string; topics: string; max_age_days: number }) =>
    apiFetch("/sources", { method: "POST", body: JSON.stringify(s) }) as Promise<Source>,
  updateSource: (
    id: number,
    patch: Partial<{ name: string; topics: string; active: boolean; max_age_days: number }>
  ) => apiFetch(`/sources/${id}`, { method: "PATCH", body: JSON.stringify(patch) }) as Promise<Source>,
  deleteSource: (id: number) => apiFetch(`/sources/${id}`, { method: "DELETE" }),
  refresh: () => apiFetch("/sources/refresh", { method: "POST" }),
  refreshStatus: () => apiFetch("/sources/refresh/status") as Promise<RefreshStatus>,
  getFeed: (cursor?: string | null) =>
    apiFetch(`/articles?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`) as Promise<FeedPage>,
  expandArticle: (id: number) =>
    apiFetch(`/articles/${id}/expand`, { method: "POST" }) as Promise<{ summary: string }>,
  getDashboardSummary: () => apiFetch("/dashboard/summary") as Promise<DashboardSummary>,
  getDashboardCalls: (cursor?: string | null) =>
    apiFetch(`/dashboard/calls?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`) as Promise<ApiCallLogPage>,
};

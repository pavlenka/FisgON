// Cliente de la API de FisgON. El token JWT se guarda en localStorage y se envía
// en la cabecera Authorization. Todas las rutas pasan por el proxy /api de Vite.

const TOKEN_KEY = "fisgon_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
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

export interface Source {
  id: number;
  site_url: string;
  feed_url: string;
  name: string;
  topics: string;
  active: boolean;
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

export const api = {
  register: (email: string, password: string) =>
    apiFetch("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }) as Promise<{
      access_token: string;
    }>,
  login: (email: string, password: string) =>
    apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }) as Promise<{
      access_token: string;
    }>,
  detect: (url: string) =>
    apiFetch("/sources/detect", { method: "POST", body: JSON.stringify({ url }) }) as Promise<DetectResult>,
  listSources: () => apiFetch("/sources") as Promise<Source[]>,
  createSource: (s: { site_url: string; feed_url: string; name: string; topics: string }) =>
    apiFetch("/sources", { method: "POST", body: JSON.stringify(s) }) as Promise<Source>,
  updateSource: (id: number, patch: Partial<{ name: string; topics: string; active: boolean }>) =>
    apiFetch(`/sources/${id}`, { method: "PATCH", body: JSON.stringify(patch) }) as Promise<Source>,
  deleteSource: (id: number) => apiFetch(`/sources/${id}`, { method: "DELETE" }),
  refresh: () => apiFetch("/sources/refresh", { method: "POST" }),
  refreshStatus: () => apiFetch("/sources/refresh/status") as Promise<RefreshStatus>,
  getFeed: (cursor?: string | null) =>
    apiFetch(`/articles?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`) as Promise<FeedPage>,
  expandArticle: (id: number) =>
    apiFetch(`/articles/${id}/expand`, { method: "POST" }) as Promise<{ summary: string }>,
};

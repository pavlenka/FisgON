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
  is_admin: boolean;
  pref_favorite_extended: boolean;
  pref_favorite_images: boolean;
  pref_email_extended: boolean;
  pref_extended_open: boolean;
  pref_theme: string;
  pref_accent: string;
}

// Campos editables de la cuenta (nombre y preferencias), todos opcionales.
export type UserPatch = Partial<
  Pick<
    AuthUser,
    | "name"
    | "pref_favorite_extended"
    | "pref_favorite_images"
    | "pref_email_extended"
    | "pref_extended_open"
    | "pref_theme"
    | "pref_accent"
  >
>;

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  email_verified: boolean;
  source_count: number;
  last_seen_at: string | null;
  created_at: string;
}

export interface Source {
  id: number;
  site_url: string;
  feed_url: string;
  name: string;
  topics: string;
  vetoed_topics: string;
  active: boolean;
  // Si la fuente entra en el feed inicial (chip "Feed").
  in_feed: boolean;
  // Antigüedad máxima (días) que se muestra de esta fuente.
  max_age_days: number;
  // Veces que se ha filtrado el feed por esta fuente (ordena los chips).
  filter_count: number;
  last_fetched_at: string | null;
}

export interface DetectResult {
  site_url: string;
  feed_url: string;
  name: string;
  suggested_topics: string;
}

export type ContactChannel = "email" | "whatsapp" | "telegram";

export interface Contact {
  id: number;
  name: string;
  channel: ContactChannel;
  destination: string;
}

export interface Article {
  id: number;
  source_id: number;
  source_name: string;
  title: string;
  summary: string;
  extended_summary: string | null;
  image_url: string | null;
  link: string;
  interesting_score: number;
  is_favorite: boolean;
  // Fotos adicionales del artículo, extraídas al marcarla favorita.
  extra_images: string[];
  is_read: boolean;
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

export interface AnalyzedArticle {
  id: number;
  source_id: number;
  source_name: string;
  original_title: string;
  topic: string | null;
  interesting_score: number;
  approved: boolean;
  reason: string | null;
  topic_vetoed: boolean;
  published_at: string;
  fetched_at: string;
}

export interface AnalyzedArticlePage {
  items: AnalyzedArticle[];
  next_cursor: string | null;
}

export interface InviteToken {
  id: number;
  token: string;
  email: string | null;
  used_at: string | null;
  used_by_email: string | null;
  expires_at: string;
  created_at: string;
}

export interface ApiCallLogRow {
  id: number;
  kind: string;
  provider: string;
  model: string;
  user_email: string;
  user_name: string;
  source_id: number | null;
  source_name: string | null;
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

// Al pasar tarjetas en el feed, cada una se marca leída: se acumulan aquí y
// se envían en un solo lote un segundo después, en vez de una petición por
// noticia.
const pendingRead = new Set<number>();
let readFlushTimer: ReturnType<typeof setTimeout> | null = null;

export function queueMarkRead(id: number) {
  pendingRead.add(id);
  if (readFlushTimer) return;
  readFlushTimer = setTimeout(() => {
    const ids = [...pendingRead];
    pendingRead.clear();
    readFlushTimer = null;
    api.markArticlesRead(ids, true).catch(() => {
      /* sin conexión: se reintentará cuando vuelvan a pasar por pantalla */
    });
  }, 1000);
}

export const api = {
  verifyEmail: (token: string) =>
    apiFetch("/auth/verify", { method: "POST", body: JSON.stringify({ token }) }) as Promise<{ message: string }>,
  resendVerification: (email: string) =>
    apiFetch("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }) as Promise<{
      message: string;
    }>,
  forgotPassword: (email: string) =>
    apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }) as Promise<{
      message: string;
    }>,
  resetPassword: (token: string, new_password: string) =>
    apiFetch("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password }) }) as Promise<{
      message: string;
    }>,
  login: (email: string, password: string) =>
    apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }) as Promise<{
      access_token: string;
    }>,
  me: () => apiFetch("/auth/me") as Promise<AuthUser>,
  updateMe: (patch: UserPatch) =>
    apiFetch("/auth/me", { method: "PATCH", body: JSON.stringify(patch) }) as Promise<AuthUser>,
  changePassword: (current_password: string, new_password: string) =>
    apiFetch("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }) as Promise<null>,
  detect: (url: string) =>
    apiFetch("/sources/detect", { method: "POST", body: JSON.stringify({ url }) }) as Promise<DetectResult>,
  listSources: () => apiFetch("/sources") as Promise<Source[]>,
  createSource: (s: {
    site_url: string;
    feed_url: string;
    name: string;
    topics: string;
    max_age_days: number;
  }) => apiFetch("/sources", { method: "POST", body: JSON.stringify(s) }) as Promise<Source>,
  updateSource: (
    id: number,
    patch: Partial<{
      name: string;
      site_url: string;
      feed_url: string;
      topics: string;
      vetoed_topics: string;
      active: boolean;
      in_feed: boolean;
      max_age_days: number;
    }>
  ) => apiFetch(`/sources/${id}`, { method: "PATCH", body: JSON.stringify(patch) }) as Promise<Source>,
  deleteSource: (id: number) => apiFetch(`/sources/${id}`, { method: "DELETE" }),
  listContacts: () => apiFetch("/contacts") as Promise<Contact[]>,
  createContact: (contact: Omit<Contact, "id">) =>
    apiFetch("/contacts", { method: "POST", body: JSON.stringify(contact) }) as Promise<Contact>,
  updateContact: (id: number, patch: Partial<Omit<Contact, "id">>) =>
    apiFetch(`/contacts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }) as Promise<Contact>,
  deleteContact: (id: number) => apiFetch(`/contacts/${id}`, { method: "DELETE" }),
  refresh: () => apiFetch("/sources/refresh", { method: "POST" }),
  refreshStatus: () => apiFetch("/sources/refresh/status") as Promise<RefreshStatus>,
  getFeed: (cursor?: string | null, opts?: { sourceId?: number | null; all?: boolean; unreadOnly?: boolean }) =>
    apiFetch(
      `/articles?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}${
        opts?.sourceId ? `&source_id=${opts.sourceId}` : ""
      }${opts?.all ? "&include_all=true" : ""}${opts?.unreadOnly ? "&unread_only=true" : ""}`
    ) as Promise<FeedPage>,
  sourceFilterHit: (id: number) => apiFetch(`/sources/${id}/filter-hit`, { method: "POST" }),
  markArticlesRead: (article_ids: number[], read: boolean) =>
    apiFetch("/articles/read", { method: "POST", body: JSON.stringify({ article_ids, read }) }),
  getFavorites: (cursor?: string | null) =>
    apiFetch(`/articles/favorites?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`) as Promise<FeedPage>,
  favoriteArticle: (id: number, favorite: boolean) =>
    apiFetch(`/articles/${id}/favorite`, { method: "POST", body: JSON.stringify({ favorite }) }) as Promise<Article>,
  expandArticle: (id: number) =>
    apiFetch(`/articles/${id}/expand`, { method: "POST" }) as Promise<{ summary: string }>,
  askArticle: (id: number, question: string) =>
    apiFetch(`/articles/${id}/ask`, { method: "POST", body: JSON.stringify({ question }) }) as Promise<{
      answer: string;
    }>,
  emailArticle: (id: number) =>
    apiFetch(`/articles/${id}/email`, { method: "POST" }) as Promise<{ message: string }>,
  getAnalyzedArticles: (cursor?: string | null) =>
    apiFetch(
      `/articles/analyzed?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
    ) as Promise<AnalyzedArticlePage>,
  reviewArticle: (id: number, approved: boolean, apply_to_source: boolean) =>
    apiFetch(`/articles/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ approved, apply_to_source }),
    }),
  getDashboardSummary: () => apiFetch("/dashboard/summary") as Promise<DashboardSummary>,
  getDashboardCalls: (cursor?: string | null) =>
    apiFetch(`/dashboard/calls?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`) as Promise<ApiCallLogPage>,
  getDashboardUsers: () => apiFetch("/dashboard/users") as Promise<AdminUser[]>,
  deleteUser: (id: number) => apiFetch(`/dashboard/users/${id}`, { method: "DELETE" }),
  registerWithInvite: (invite_token: string, email: string, password: string, name: string) =>
    apiFetch("/auth/register-invite", { method: "POST", body: JSON.stringify({ invite_token, email, password, name }) }) as Promise<{ message: string }>,
  listInvites: () => apiFetch("/dashboard/invites") as Promise<InviteToken[]>,
  createInvite: (email: string) =>
    apiFetch("/dashboard/invites", { method: "POST", body: JSON.stringify({ email }) }) as Promise<InviteToken>,
  revokeInvite: (id: number) => apiFetch(`/dashboard/invites/${id}`, { method: "DELETE" }),
};

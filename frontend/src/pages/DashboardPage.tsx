import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type AdminUser, type InviteToken } from "../api";
import { useAuth } from "../auth";

const KIND_LABELS: Record<string, string> = {
  detect_topics: "Detectar tema",
  analyze_article: "Analizar noticia",
  expand_summary: "Resumen extenso",
  ask_article: "Pregunta sobre noticia",
};

function formatDate(iso: string): string {
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return date.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatCreatedAt(iso: string): string {
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

// Números grandes abreviados (1,2 M, 340 mil…); el valor exacto se ve al
// pasar por encima (title).
const compact = new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 });
const exact = new Intl.NumberFormat("es-ES");

function Num({ value }: { value: number }) {
  return <span title={exact.format(value)}>{compact.format(value)}</span>;
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} s` : `${ms} ms`;
}

export default function DashboardPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: api.getDashboardSummary,
  });

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ["dashboard-users"],
    queryFn: api.getDashboardUsers,
  });

  const deleteUserMut = useMutation({
    mutationFn: (id: number) => api.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-users"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-calls"] });
    },
  });

  function handleDeleteUser(u: AdminUser) {
    if (
      window.confirm(
        `¿Eliminar a ${u.name} (${u.email})?\n\n` +
          "Se borrarán también sus fuentes, sus noticias y su historial de llamadas. No se puede deshacer."
      )
    ) {
      deleteUserMut.mutate(u.id);
    }
  }

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["dashboard-calls"],
    queryFn: ({ pageParam }) => api.getDashboardCalls(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });

  const calls = data?.pages.flatMap((p) => p.items) ?? [];

  // Invitaciones
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);

  const { data: invites, isLoading: loadingInvites } = useQuery({
    queryKey: ["dashboard-invites"],
    queryFn: api.listInvites,
  });

  const createInviteMut = useMutation({
    mutationFn: (email: string) => api.createInvite(email),
    onSuccess: (inv: InviteToken) => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-invites"] });
      setInviteMsg(`Invitación enviada a ${inv.email ?? inviteEmail}`);
      setInviteEmail("");
      setInviteErr(null);
    },
    onError: (e: Error) => {
      setInviteErr(e.message);
      setInviteMsg(null);
    },
  });

  const revokeInviteMut = useMutation({
    mutationFn: (id: number) => api.revokeInvite(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-invites"] }),
  });

  function submitInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteMsg(null);
    setInviteErr(null);
    createInviteMut.mutate(inviteEmail.trim());
  }

  return (
    <div className="dashboard">
      <h2>Dashboard de llamadas a la IA</h2>

      {loadingSummary && <p className="muted">Cargando resumen…</p>}
      {summary && (
        <>
          <div className="dashboard-stats">
            <div className="stat-card">
              <div className="stat-value">
                <Num value={summary.total_calls} />
              </div>
              <div className="stat-label">Llamadas totales</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                <Num value={summary.total_tokens} />
              </div>
              <div className="stat-label">Tokens totales</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.total_cost.toFixed(4)}</div>
              <div className="stat-label">Coste (USD)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                <Num value={summary.error_count} />
              </div>
              <div className="stat-label">Errores</div>
            </div>
          </div>

          {summary.by_kind.length > 0 && (
            <div className="card">
              <h3>Desglose por tipo</h3>
              <table className="calls-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Llamadas</th>
                    <th>Tokens</th>
                    <th>Coste</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_kind.map((k) => (
                    <tr key={k.kind}>
                      <td>{KIND_LABELS[k.kind] ?? k.kind}</td>
                      <td>
                        <Num value={k.calls} />
                      </td>
                      <td>
                        <Num value={k.total_tokens} />
                      </td>
                      <td>{k.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="card">
        <h3>Usuarios</h3>
        {loadingUsers && <p className="muted">Cargando…</p>}
        {!loadingUsers && (!users || users.length === 0) && <p className="muted">No hay usuarios.</p>}
        {users && users.length > 0 && (
          <table className="calls-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Correo verificado</th>
                <th>Fuentes</th>
                <th>Última conexión</th>
                <th>Alta</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.is_admin ? "Administrador" : "Usuario"}</td>
                  <td>{u.email_verified ? "Sí" : "No"}</td>
                  <td>{u.source_count}</td>
                  <td>{u.last_seen_at ? formatDate(u.last_seen_at) : "Nunca"}</td>
                  <td>{formatCreatedAt(u.created_at)}</td>
                  <td>
                    {u.id !== me?.id && (
                      <button
                        className="danger review-btn"
                        onClick={() => handleDeleteUser(u)}
                        disabled={deleteUserMut.isPending}
                      >
                        Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Invitaciones</h3>
        <form onSubmit={submitInvite} style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <input
            type="email"
            placeholder="Correo del invitado"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={createInviteMut.isPending}>
            {createInviteMut.isPending ? "Enviando…" : "Enviar invitación"}
          </button>
        </form>
        {inviteMsg && <p className="muted">{inviteMsg}</p>}
        {inviteErr && <p className="error">{inviteErr}</p>}
        {loadingInvites && <p className="muted">Cargando…</p>}
        {invites && invites.length > 0 && (
          <table className="calls-table">
            <thead>
              <tr>
                <th>Correo</th>
                <th>Creada</th>
                <th>Caduca</th>
                <th>Usada por</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} className={inv.used_at ? "call-error" : ""}>
                  <td>{inv.email ?? "—"}</td>
                  <td>{formatDate(inv.created_at)}</td>
                  <td>{formatCreatedAt(inv.expires_at)}</td>
                  <td>{inv.used_by_email ?? (inv.used_at ? "?" : "Pendiente")}</td>
                  <td>
                    {!inv.used_at && (
                      <button
                        className="danger review-btn"
                        onClick={() => revokeInviteMut.mutate(inv.id)}
                        disabled={revokeInviteMut.isPending}
                      >
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {invites && invites.length === 0 && <p className="muted">No hay invitaciones.</p>}
      </div>

      <div className="card">
        <h3>Historial de llamadas</h3>
        {isLoading && <p className="muted">Cargando…</p>}
        {!isLoading && calls.length === 0 && <p className="muted">Todavía no se ha llamado a la IA.</p>}
        {calls.length > 0 && (
          <table className="calls-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Usuario</th>
                <th>Web</th>
                <th>Modelo</th>
                <th>Tokens</th>
                <th>Coste</th>
                <th>Duración</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} className={c.success ? "" : "call-error"}>
                  <td>{formatDate(c.created_at)}</td>
                  <td>{KIND_LABELS[c.kind] ?? c.kind}</td>
                  <td title={c.user_email}>{c.user_name}</td>
                  <td>{c.source_name ?? "—"}</td>
                  <td>
                    {c.provider}/{c.model}
                  </td>
                  <td>{c.total_tokens != null ? <Num value={c.total_tokens} /> : "—"}</td>
                  <td>{c.cost != null ? c.cost.toFixed(4) : "—"}</td>
                  <td>{c.duration_ms != null ? formatMs(c.duration_ms) : "—"}</td>
                  <td title={c.error ?? undefined}>{c.success ? "OK" : "Error"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {calls.length > 0 && (
          <button onClick={() => fetchNextPage()} disabled={!hasNextPage || isFetchingNextPage}>
            {isFetchingNextPage ? "Cargando…" : hasNextPage ? "Cargar más" : "No hay más"}
          </button>
        )}
      </div>
    </div>
  );
}

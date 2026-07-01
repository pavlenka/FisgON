import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "../api";

const KIND_LABELS: Record<string, string> = {
  detect_topics: "Detectar tema",
  analyze_article: "Analizar noticia",
  expand_summary: "Resumen extenso",
};

function formatDate(iso: string): string {
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return date.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function DashboardPage() {
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: api.getDashboardSummary,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["dashboard-calls"],
    queryFn: ({ pageParam }) => api.getDashboardCalls(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });

  const calls = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="dashboard">
      <h2>Dashboard de llamadas a la IA</h2>

      {loadingSummary && <p className="muted">Cargando resumen…</p>}
      {summary && (
        <>
          <div className="dashboard-stats">
            <div className="stat-card">
              <div className="stat-value">{summary.total_calls}</div>
              <div className="stat-label">Llamadas totales</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.total_tokens}</div>
              <div className="stat-label">Tokens totales</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.total_cost.toFixed(4)}</div>
              <div className="stat-label">Coste (unidades del proveedor)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{summary.error_count}</div>
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
                      <td>{k.calls}</td>
                      <td>{k.total_tokens}</td>
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
        <h3>Historial de llamadas</h3>
        {isLoading && <p className="muted">Cargando…</p>}
        {!isLoading && calls.length === 0 && <p className="muted">Todavía no se ha llamado a la IA.</p>}
        {calls.length > 0 && (
          <table className="calls-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
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
                  <td>
                    {c.provider}/{c.model}
                  </td>
                  <td>{c.total_tokens ?? "—"}</td>
                  <td>{c.cost != null ? c.cost.toFixed(4) : "—"}</td>
                  <td>{c.duration_ms != null ? `${c.duration_ms} ms` : "—"}</td>
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

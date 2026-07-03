import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../api";

function formatDate(iso: string): string {
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return date.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AnalyzedPage() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["analyzed-articles"],
    queryFn: ({ pageParam }) => api.getAnalyzedArticles(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });

  const articles = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="analyzed">
      <h2>Noticias analizadas</h2>
      <div className="card">
        {isLoading && <p className="muted">Cargando…</p>}
        {!isLoading && articles.length === 0 && <p className="muted">Todavía no se ha analizado ninguna noticia.</p>}
        {articles.length > 0 && (
          <table className="calls-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Fuente</th>
                <th>Tema</th>
                <th>Titular original</th>
                <th>Interés</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className={a.approved ? "" : "call-error"}>
                  <td>{formatDate(a.fetched_at)}</td>
                  <td>{a.source_name}</td>
                  <td>{a.topic ?? "—"}</td>
                  <td>{a.original_title}</td>
                  <td>{a.interesting_score}</td>
                  <td title={a.reason ?? undefined}>{a.approved ? "Aprobada" : a.reason ?? "Descartada"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {articles.length > 0 && (
          <button onClick={() => fetchNextPage()} disabled={!hasNextPage || isFetchingNextPage}>
            {isFetchingNextPage ? "Cargando…" : hasNextPage ? "Cargar más" : "No hay más"}
          </button>
        )}
      </div>
    </div>
  );
}

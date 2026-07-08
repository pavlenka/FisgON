import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type AnalyzedArticle } from "../api";

function formatDate(iso: string): string {
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return date.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AnalyzedPage() {
  const queryClient = useQueryClient();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["analyzed-articles"],
    queryFn: ({ pageParam }) => api.getAnalyzedArticles(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, approved, applyToSource }: { id: number; approved: boolean; applyToSource: boolean }) =>
      api.reviewArticle(id, approved, applyToSource),
    onSuccess: () => {
      // La decisión afecta al feed y (si se aplica al tema) a otras filas.
      queryClient.invalidateQueries({ queryKey: ["analyzed-articles"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  function handleReview(a: AnalyzedArticle) {
    const approved = !a.approved;
    let applyToSource = false;
    if (a.topic) {
      const msg = approved
        ? `Se aprobará esta noticia.\n\n¿Aceptar también el tema «${a.topic}» en ${a.source_name}? ` +
          `Se aprobarán todas sus noticias de ese tema y las futuras se clasificarán dentro de tema.`
        : `Se descartará esta noticia.\n\n¿Vetar el tema «${a.topic}» en ${a.source_name}? ` +
          `Se descartarán todas sus noticias de ese tema, presentes y futuras.\n\n` +
          `Cancela para descartar solo esta.`;
      applyToSource = window.confirm(msg);
    }
    reviewMut.mutate({ id: a.id, approved, applyToSource });
  }

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
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className={a.approved ? "" : "call-error"}>
                  <td>{formatDate(a.fetched_at)}</td>
                  <td>{a.source_name}</td>
                  <td>
                    {a.topic ?? "—"}
                    {a.topic_vetoed && <span className="veto-tag" title="Tema vetado en esta fuente">vetado</span>}
                  </td>
                  <td>{a.original_title}</td>
                  <td title={a.reason ?? undefined}>{a.approved ? "Aprobada" : a.reason ?? "Descartada"}</td>
                  <td>
                    <button
                      className="review-btn"
                      onClick={() => handleReview(a)}
                      disabled={reviewMut.isPending}
                    >
                      {a.approved ? "Descartar" : "Aprobar"}
                    </button>
                  </td>
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

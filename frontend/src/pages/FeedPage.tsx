import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Article } from "../api";
import ArticleCard from "../components/ArticleCard";
import SkeletonCard from "../components/SkeletonCard";

export default function FeedPage() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  // Filtro por fuente: null = todas. Los chips se ordenan por uso (las más
  // filtradas primero); el orden se congela al montar para que no bailen
  // bajo el dedo, y se recalcula en la próxima visita.
  const [sourceId, setSourceId] = useState<number | null>(null);
  const { data: sources } = useQuery({ queryKey: ["sources"], queryFn: api.listSources });
  const orderedSources = useMemo(
    () =>
      (sources ?? [])
        .filter((s) => s.active)
        .sort((a, b) => b.filter_count - a.filter_count || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources !== undefined]
  );

  function selectSource(id: number | null) {
    setSourceId(id);
    if (id !== null) {
      // Anotamos el uso para el orden futuro; si falla no pasa nada.
      api.sourceFilterHit(id).catch(() => {});
    }
  }

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useInfiniteQuery({
    queryKey: ["feed", sourceId],
    queryFn: ({ pageParam }) => api.getFeed(pageParam, sourceId),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      await api.refresh();
      // Sondeamos el estado hasta que el procesado en background termine.
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const status = await api.refreshStatus();
        if (!status.processing) {
          setRefreshMsg(status.error ? "Hubo un error al actualizar" : `${status.new} noticias nuevas`);
          break;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["feed"] });
    } catch (e) {
      setRefreshMsg((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  const articles: Article[] = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="feed">
      <div className="feed-toolbar">
        <button onClick={handleRefresh} disabled={refreshing}>
          {refreshing && <span className="spinner" />}
          {refreshing ? "Actualizando…" : "Actualizar"}
        </button>
        {refreshMsg && <span className="muted">{refreshMsg}</span>}
      </div>

      {orderedSources.length > 1 && (
        <div className="source-chips">
          <button className={`chip${sourceId === null ? " active" : ""}`} onClick={() => selectSource(null)}>
            Todas
          </button>
          {orderedSources.map((s) => (
            <button
              key={s.id}
              className={`chip${sourceId === s.id ? " active" : ""}`}
              onClick={() => selectSource(sourceId === s.id ? null : s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}
      {error && <p className="error">{(error as Error).message}</p>}
      {!isLoading && articles.length === 0 && sourceId !== null && (
        <p className="muted">No hay noticias de esta fuente en el feed.</p>
      )}
      {!isLoading && articles.length === 0 && sourceId === null && (
        <p className="muted">
          No hay noticias todavía. Añade webs en <b>Fuentes</b> y pulsa <b>Actualizar</b>.
        </p>
      )}

      {articles.map((a) => (
        <ArticleCard key={a.id} article={a} />
      ))}

      <div ref={sentinel} />
      {isFetchingNextPage && <SkeletonCard />}
    </div>
  );
}

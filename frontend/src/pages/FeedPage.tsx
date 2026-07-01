import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Article } from "../api";
import ArticleCard from "../components/ArticleCard";

export default function FeedPage() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: ({ pageParam }) => api.getFeed(pageParam),
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
          {refreshing ? "Actualizando…" : "Actualizar"}
        </button>
        {refreshMsg && <span className="muted">{refreshMsg}</span>}
      </div>

      {isLoading && <p className="muted">Cargando…</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      {!isLoading && articles.length === 0 && (
        <p className="muted">
          No hay noticias todavía. Añade webs en <b>Fuentes</b> y pulsa <b>Actualizar</b>.
        </p>
      )}

      {articles.map((a) => (
        <ArticleCard key={a.id} article={a} />
      ))}

      <div ref={sentinel} />
      {isFetchingNextPage && <p className="muted">Cargando más…</p>}
    </div>
  );
}

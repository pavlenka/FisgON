import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, type Article } from "../api";
import ArticleCard from "../components/ArticleCard";

export default function FavoritesPage() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useInfiniteQuery({
    queryKey: ["favorites"],
    queryFn: ({ pageParam }) => api.getFavorites(pageParam),
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

  const articles: Article[] = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="feed">
      {isLoading && <p className="muted">Cargando…</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      {!isLoading && articles.length === 0 && (
        <p className="muted">
          No tienes favoritas todavía. Marca la <b>☆</b> en cualquier noticia del feed y se guardará aquí
          con su informe completo y más fotos.
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

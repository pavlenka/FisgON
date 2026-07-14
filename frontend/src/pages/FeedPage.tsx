import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Article } from "../api";
import { turnPage } from "../pageTurn";
import ArticleCard from "../components/ArticleCard";
import SkeletonCard from "../components/SkeletonCard";

// Vista del feed: "feed" = fuentes marcadas para el feed inicial,
// "all" = todas las fuentes, número = una fuente concreta.
type View = "feed" | "all" | number;

export default function FeedPage() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const [view, setView] = useState<View>("feed");
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Los chips se ordenan por uso (las más filtradas primero); el orden se
  // congela al montar para que no bailen bajo el dedo.
  const { data: sources } = useQuery({ queryKey: ["sources"], queryFn: api.listSources });
  const orderedSources = useMemo(
    () =>
      (sources ?? [])
        .filter((s) => s.active)
        .sort((a, b) => b.filter_count - a.filter_count || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources !== undefined]
  );

  function selectView(next: View) {
    setView(next);
    if (typeof next === "number") {
      // Anotamos el uso para el orden futuro; si falla no pasa nada.
      api.sourceFilterHit(next).catch(() => {});
    }
  }

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useInfiniteQuery({
    queryKey: ["feed", view, unreadOnly],
    queryFn: ({ pageParam }) =>
      api.getFeed(pageParam, {
        sourceId: typeof view === "number" ? view : null,
        all: view === "all",
        unreadOnly,
      }),
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
    if (refreshing) return;
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
  const refreshRef = useRef(handleRefresh);
  refreshRef.current = handleRefresh;

  // Tirar hacia abajo desde arriba del todo para refrescar (móvil): sustituye
  // al botón "Actualizar", que en pantallas pequeñas se oculta.
  const [pull, setPull] = useState(0);
  useEffect(() => {
    let startY = 0;
    let pulling = false;
    const onStart = (e: TouchEvent) => {
      pulling = window.scrollY <= 0;
      if (pulling) startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 8 && window.scrollY <= 0) {
        // Resistencia: la banda crece a la mitad del gesto, con tope.
        setPull(Math.min((dy - 8) * 0.5, 110));
        if (e.cancelable) e.preventDefault();
      } else {
        setPull(0);
      }
    };
    const onEnd = () => {
      if (!pulling) return;
      pulling = false;
      setPull((p) => {
        if (p > 70) refreshRef.current();
        return 0;
      });
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  // Botón fijo para volver al principio: aparece en cuanto bajas un poco.
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Flechas del teclado para saltar de noticia en noticia (con la animación
  // de pasar hoja). En móvil, los botones flotantes hacen lo mismo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        turnPage(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        turnPage(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const articles: Article[] = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="feed">
      {/* Banda del gesto de tirar para refrescar */}
      <div className="ptr" style={{ height: pull }} aria-hidden="true">
        <span className={`ptr-arrow${pull > 70 ? " ready" : ""}`}>↓</span>
      </div>

      <div className="feed-toolbar">
        <button className="refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          {refreshing && <span className="spinner" />}
          {refreshing ? "Actualizando…" : "Actualizar"}
        </button>
        {refreshing && (
          <span className="muted mobile-refreshing">
            <span className="spinner" /> Actualizando…
          </span>
        )}
        {refreshMsg && <span className="muted">{refreshMsg}</span>}
      </div>

      {orderedSources.length > 0 && (
        <div className="source-chips">
          <button className={`chip${view === "feed" ? " active" : ""}`} onClick={() => selectView("feed")}>
            Feed
          </button>
          <button className={`chip${view === "all" ? " active" : ""}`} onClick={() => selectView("all")}>
            Todas
          </button>
          <button
            className={`chip unread-chip${unreadOnly ? " active" : ""}`}
            title="Mostrar solo las noticias sin leer"
            onClick={() => setUnreadOnly(!unreadOnly)}
          >
            ● Sin leer
          </button>
          {orderedSources.map((s) => (
            <button
              key={s.id}
              className={`chip${view === s.id ? " active" : ""}`}
              onClick={() => selectView(view === s.id ? "feed" : s.id)}
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
      {!isLoading && articles.length === 0 && unreadOnly && (
        <p className="muted">No queda nada sin leer por aquí. 🎉</p>
      )}
      {!isLoading && articles.length === 0 && !unreadOnly && typeof view === "number" && (
        <p className="muted">No hay noticias de esta fuente en el feed.</p>
      )}
      {!isLoading && articles.length === 0 && !unreadOnly && typeof view !== "number" && (
        <p className="muted">
          No hay noticias todavía. Añade webs en <b>Fuentes</b> y desliza hacia abajo para actualizar.
        </p>
      )}

      {articles.map((a) => (
        <ArticleCard key={a.id} article={a} />
      ))}

      <div ref={sentinel} />
      {isFetchingNextPage && <SkeletonCard />}

      {/* Flechas de saltar de noticia: fijas a media altura, donde cae el
          pulgar. La hoja del bloc se anima al saltar. */}
      {articles.length > 0 && (
        <div className="article-nav">
          <button onClick={() => turnPage(-1)} title="Noticia anterior">
            ▲
          </button>
          <button onClick={() => turnPage(1)} title="Noticia siguiente">
            ▼
          </button>
        </div>
      )}

      {/* Controles fijos: quitar el filtro activo y volver al principio. */}
      <div className="floating-controls">
        {typeof view === "number" && (
          <button className="chip active" onClick={() => selectView("feed")} title="Quitar el filtro de fuente">
            ✕ {orderedSources.find((s) => s.id === view)?.name ?? "Filtro"}
          </button>
        )}
        {showTop && (
          <button
            className="to-top"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title="Volver al principio"
          >
            ↑
          </button>
        )}
      </div>
    </div>
  );
}

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Article } from "../api";
import { turnPage } from "../pageTurn";
import ArticleCard from "../components/ArticleCard";
import SkeletonCard from "../components/SkeletonCard";

// Vista del feed: "feed" = fuentes marcadas para el feed inicial,
// "all" = todas las fuentes, número = una fuente concreta.
type View = "feed" | "all" | number;

// Fechas del backend: UTC naive (sin zona); las tratamos como UTC.
function toLocalDate(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
// Clave de día para detectar el cambio entre tarjetas consecutivas.
function dayKey(iso: string): string {
  const d = toLocalDate(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
// Etiqueta legible del separador: Hoy / Ayer / "lunes, 21 de julio".
function dayLabel(iso: string): string {
  const d = toLocalDate(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return "Hoy";
  if (sameDay(d, yesterday)) return "Ayer";
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === today.getFullYear()
      ? { weekday: "long", day: "numeric", month: "long" }
      : { day: "numeric", month: "long", year: "numeric" };
  return d.toLocaleDateString("es-ES", opts);
}

export default function FeedPage() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const [view, setView] = useState<View>("feed");
  // El feed abre siempre enseñando solo lo pendiente; el toggle "Sin leer"
  // (en la barrita, a la derecha) lo quita para ver también lo leído.
  const [unreadOnly, setUnreadOnly] = useState(true);

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
        <button
          className="refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Actualizar las noticias"
        >
          <svg
            className={refreshing ? "spin" : ""}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 11a8 8 0 1 0-2.6 5.9" />
            <path d="M20 5.5V11h-5.5" />
          </svg>
        </button>
        {refreshing && (
          <span className="muted mobile-refreshing">
            <span className="spinner" /> Actualizando…
          </span>
        )}
        {refreshMsg && <span className="muted">{refreshMsg}</span>}
        <button
          className={`chip unread-chip${unreadOnly ? " active" : ""}`}
          title={unreadOnly ? "Mostrar también las leídas" : "Mostrar solo las noticias sin leer"}
          onClick={() => setUnreadOnly(!unreadOnly)}
        >
          ● Sin leer
        </button>
      </div>

      {orderedSources.length > 0 && (
        <div className="source-chips">
          <button className={`chip${view === "feed" ? " active" : ""}`} onClick={() => selectView("feed")}>
            Feed
          </button>
          <button className={`chip${view === "all" ? " active" : ""}`} onClick={() => selectView("all")}>
            Todas
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
        <p className="muted">
          No queda nada sin leer. 🎉 Apaga <b>● Sin leer</b> (arriba a la derecha) para ver también las leídas.
        </p>
      )}
      {!isLoading && articles.length === 0 && !unreadOnly && typeof view === "number" && (
        <p className="muted">No hay noticias de esta fuente en el feed.</p>
      )}
      {!isLoading && articles.length === 0 && !unreadOnly && typeof view !== "number" && (
        <p className="muted">
          No hay noticias todavía. Añade webs en <b>Fuentes</b> y desliza hacia abajo para actualizar.
        </p>
      )}

      {articles.map((a, i) => {
        // Separador cuando cambia el día respecto a la tarjeta anterior
        // (incluida la primera, para saber de qué día es la cabeza del feed).
        const prev = articles[i - 1];
        const newDay = !prev || dayKey(prev.published_at) !== dayKey(a.published_at);
        return (
          <Fragment key={a.id}>
            {newDay && (
              <div className="day-divider">
                <span>{dayLabel(a.published_at)}</span>
              </div>
            )}
            <ArticleCard article={a} />
          </Fragment>
        );
      })}

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

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, queueMarkRead, type Article } from "../api";
import { useAuth } from "../auth";

// Las fechas del backend son UTC naive (sin zona); las tratamos como UTC.
function toDate(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
}

function timeAgo(iso: string): string {
  const date = toDate(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 3600) return `hace ${Math.max(1, Math.floor(diff / 60))} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ArticleCard({ article, markAllTick = 0 }: { article: Article; markAllTick?: number }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // El resumen extenso está guardado en BD: si ya se generó alguna vez,
  // se muestra directamente aunque se haya recargado la página.
  const [extended, setExtended] = useState<string | null>(article.extended_summary);
  // El informe es un acordeón: desplegado o plegado según la preferencia
  // del usuario (Cuenta > Preferencias).
  const [reportOpen, setReportOpen] = useState(user?.pref_extended_open ?? true);
  const [favorite, setFavorite] = useState(article.is_favorite);
  const [gallery, setGallery] = useState<string[]>(article.extra_images);
  const [read, setRead] = useState(article.is_read);
  const [error, setError] = useState<string | null>(null);

  // Al pasar la tarjeta entera (su borde inferior sale por arriba de la
  // pantalla), se marca leída sola. Comprobación directa sobre el scroll
  // (con rAF para no medir más de una vez por frame): más fiable que un
  // IntersectionObserver, que agrupa eventos en scrolls rápidos y podía
  // perderse la salida. Solo hacia adelante: desmarcarla es manual.
  const cardRef = useRef<HTMLElement | null>(null);
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    const node = cardRef.current;
    if (!node || readRef.current) return;
    const onScroll = () => {
      if (readRef.current) {
        window.removeEventListener("scroll", onScroll);
        return;
      }
      if (node.getBoundingClientRect().bottom < 0) {
        setRead(true);
        article.is_read = true;
        queueMarkRead(article.id);
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al llegar al final del feed, todas las tarjetas quedan leídas (las
  // últimas nunca llegan a salir por arriba, así que el scroll no las marca).
  useEffect(() => {
    if (markAllTick > 0 && !readRef.current) {
      setRead(true);
      article.is_read = true;
      queueMarkRead(article.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markAllTick]);

  function toggleRead() {
    const next = !read;
    setRead(next);
    article.is_read = next;
    api.markArticlesRead([article.id], next).catch(() => {});
  }

  // Si guardaste la noticia y seguiste leyendo el feed, al terminar de
  // generarse el informe aparece un acceso directo flotante para volver.
  const [showReadyPill, setShowReadyPill] = useState(false);
  function offerReturnIfAway() {
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect && (rect.bottom < 0 || rect.top > window.innerHeight)) {
      setShowReadyPill(true);
      setTimeout(() => setShowReadyPill(false), 15000);
    }
  }

  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const askMut = useMutation({
    mutationFn: (q: string) => api.askArticle(article.id, q),
    onSuccess: (res) => {
      setAnswer(res.answer);
      setQuestion("");
    },
    onError: (e: Error) => setError(e.message),
  });

  function submitQuestion(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setError(null);
    askMut.mutate(question.trim());
  }

  const removeMut = useMutation({
    mutationFn: () => api.reviewArticle(article.id, false, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["analyzed-articles"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  // Marcar favorita genera el informe extenso y extrae más fotos en el
  // backend: la respuesta trae la noticia actualizada y refrescamos la tarjeta.
  const favMut = useMutation({
    mutationFn: () => api.favoriteArticle(article.id, !favorite),
    onSuccess: (res) => {
      setError(null);
      setFavorite(res.is_favorite);
      setGallery(res.extra_images);
      if (res.extended_summary && !extended) {
        // Recién generado como efecto de guardar: se muestra PLEGADO para no
        // mover el feed. Se abre luego con la cabecera del informe. Si el
        // usuario siguió bajando mientras se generaba, píldora para volver.
        setReportOpen(false);
        offerReturnIfAway();
      }
      setExtended(res.extended_summary);
      article.is_favorite = res.is_favorite;
      article.extra_images = res.extra_images;
      article.extended_summary = res.extended_summary;
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const emailMut = useMutation({
    mutationFn: () => api.emailArticle(article.id),
    onSuccess: async (res) => {
      setError(null);
      setEmailMsg(res.message);
      // Si el correo generó el informe en el backend, lo recogemos para la
      // tarjeta (viene cacheado: no cuesta otra llamada a la IA). Plegado,
      // para no mover el feed.
      if (user?.pref_email_extended && !extended) {
        try {
          const exp = await api.expandArticle(article.id);
          setReportOpen(false);
          setExtended(exp.summary);
          article.extended_summary = exp.summary;
        } catch {
          /* si falla, la tarjeta se queda como estaba */
        }
      }
    },
    onError: (e: Error) => {
      setEmailMsg(null);
      setError(e.message);
    },
  });

  return (
    <article className={`card${read ? "" : " unread"}`} ref={cardRef}>
      {article.image_url && (
        <img
          className="card-image"
          src={article.image_url}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="card-meta">
        <span className="source">{article.source_name}</span>
        <span className="dot">·</span>
        <span className="time">{timeAgo(article.published_at)}</span>
        <span className="card-meta-actions">
          <button
            className={`read-btn${read ? "" : " unread"}`}
            title={read ? "Marcar como no leída" : "Marcar como leída"}
            onClick={toggleRead}
          >
            {read ? "✓ Leída" : "● No leída"}
          </button>
          <button
            className={`fav-btn${favorite ? " active" : ""}`}
            title={
              favorite
                ? "Quitar de Leer más tarde"
                : "Guardar para leer más tarde: genera el informe completo y busca más fotos"
            }
            onClick={() => favMut.mutate()}
            disabled={favMut.isPending}
          >
            {favMut.isPending ? (
              <>
                <span className="spinner" /> Guardando
              </>
            ) : favorite ? (
              "★ Guardada"
            ) : (
              "☆ Más tarde"
            )}
          </button>
          <button
            className="dismiss-btn"
            title="Quitar esta noticia del feed (se puede recuperar en Analizadas)"
            onClick={() => removeMut.mutate()}
            disabled={removeMut.isPending}
          >
            ✕ Quitar
          </button>
        </span>
      </div>
      <h2 className="card-title">{article.title}</h2>
      <p className="card-summary">{article.summary}</p>

      {extended && (
        <div className="card-summary-extended">
          <button
            className="report-toggle"
            onClick={() => setReportOpen(!reportOpen)}
            title={reportOpen ? "Plegar el informe" : "Desplegar el informe"}
          >
            <span className={`chevron${reportOpen ? " open" : ""}`}>▸</span>
            Informe completo
          </button>
          {reportOpen && <p className="card-summary">{extended}</p>}
        </div>
      )}

      {favorite && gallery.length > 0 && (
        <div className="card-gallery">
          {gallery.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer">
              <img
                src={src}
                alt=""
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                }}
              />
            </a>
          ))}
        </div>
      )}

      {answer && (
        <div className="card-summary-extended">
          <div className="file-label">Respuesta</div>
          <p className="card-summary">{answer}</p>
        </div>
      )}

      {asking && (
        <form className="ask-form" onSubmit={submitQuestion}>
          <input
            placeholder="Pregunta algo sobre esta noticia…"
            value={question}
            maxLength={500}
            autoFocus
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" disabled={!question.trim() || askMut.isPending}>
            {askMut.isPending && <span className="spinner" />}
            {askMut.isPending ? "Pensando…" : "Preguntar"}
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
      {emailMsg && <p className="muted">{emailMsg}</p>}

      {/* Portal a <body>: si la píldora se renderiza dentro de la tarjeta,
          los transform de .card (hover/entrada) y .page-fade rompen su
          position:fixed y el clic cae en el botón de debajo. Fuera de todo
          ancestro transformado se posiciona bien respecto a la pantalla. */}
      {showReadyPill &&
        createPortal(
          <button
            className="ready-pill"
            onClick={() => {
              setShowReadyPill(false);
              cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            Informe listo · Ir a la noticia ↩
          </button>,
          document.body
        )}

      <div className="card-actions">
        <a className="card-link" href={article.link} target="_blank" rel="noreferrer">
          Leer en la fuente →
        </a>
        <div className="card-buttons">
          <button
            className="expand-btn"
            title="Enviar esta noticia a tu correo, para leerla más tarde o compartirla"
            onClick={() => emailMut.mutate()}
            disabled={emailMut.isPending}
          >
            {emailMut.isPending && <span className="spinner" />}
            {emailMut.isPending ? "Enviando…" : "Enviar al correo"}
          </button>
          <button
            className="expand-btn"
            onClick={() => {
              setAsking(!asking);
              setError(null);
            }}
          >
            {asking ? "Cerrar pregunta" : "Preguntar"}
          </button>
        </div>
      </div>
    </article>
  );
}

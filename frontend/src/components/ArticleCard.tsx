import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Article } from "../api";

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

export default function ArticleCard({ article }: { article: Article }) {
  const queryClient = useQueryClient();

  // El resumen extenso está guardado en BD: si ya se generó alguna vez,
  // se muestra directamente aunque se haya recargado la página.
  const [extended, setExtended] = useState<string | null>(article.extended_summary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  async function handleExpand() {
    if (extended) {
      setExtended(null);
      return;
    }
    if (article.extended_summary) {
      // Ya estaba generado (lo habíamos plegado): no hace falta pedirlo.
      setExtended(article.extended_summary);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.expandArticle(article.id);
      setExtended(res.summary);
      article.extended_summary = res.summary;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

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

  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const emailMut = useMutation({
    mutationFn: () => api.emailArticle(article.id),
    onSuccess: (res) => {
      setError(null);
      setEmailMsg(res.message);
    },
    onError: (e: Error) => {
      setEmailMsg(null);
      setError(e.message);
    },
  });

  return (
    <article className="card">
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
        <button
          className="dismiss-btn"
          title="Quitar esta noticia del feed (se puede recuperar en Analizadas)"
          onClick={() => removeMut.mutate()}
          disabled={removeMut.isPending}
        >
          ✕ Quitar
        </button>
      </div>
      <h2 className="card-title">{article.title}</h2>
      <p className="card-summary">{article.summary}</p>

      {extended && (
        <div className="card-summary-extended">
          <div className="file-label">Informe completo</div>
          <p className="card-summary">{extended}</p>
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
            {askMut.isPending ? "Pensando…" : "Preguntar"}
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
      {emailMsg && <p className="muted">{emailMsg}</p>}

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
          <button className="expand-btn" onClick={handleExpand} disabled={loading}>
            {loading ? "Ampliando…" : extended ? "Ver menos" : "Resumen más extenso"}
          </button>
        </div>
      </div>
    </article>
  );
}

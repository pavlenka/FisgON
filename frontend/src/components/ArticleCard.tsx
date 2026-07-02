import { useState } from "react";
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
  const [extended, setExtended] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExpand() {
    if (extended) {
      setExtended(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.expandArticle(article.id);
      setExtended(res.summary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

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
      </div>
      <h2 className="card-title">{article.title}</h2>
      <p className="card-summary">{article.summary}</p>

      {extended && (
        <div className="card-summary-extended">
          <div className="file-label">Informe completo</div>
          <p className="card-summary">{extended}</p>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="card-actions">
        <a className="card-link" href={article.link} target="_blank" rel="noreferrer">
          Leer en la fuente →
        </a>
        <button className="expand-btn" onClick={handleExpand} disabled={loading}>
          {loading ? "Ampliando…" : extended ? "Ver menos" : "Resumen más extenso"}
        </button>
      </div>
    </article>
  );
}

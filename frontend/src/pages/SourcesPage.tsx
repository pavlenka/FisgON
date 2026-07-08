import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type DetectResult, type Source } from "../api";

interface EditForm {
  name: string;
  site_url: string;
  feed_url: string;
  topics: string;
  vetoed_topics: string;
  max_age_days: number;
  summary_paragraphs: number;
}

function toEditForm(s: Source): EditForm {
  return {
    name: s.name,
    site_url: s.site_url,
    feed_url: s.feed_url,
    topics: s.topics,
    vetoed_topics: s.vetoed_topics,
    max_age_days: s.max_age_days,
    summary_paragraphs: s.summary_paragraphs,
  };
}

export default function SourcesPage() {
  const queryClient = useQueryClient();
  const { data: sources } = useQuery({ queryKey: ["sources"], queryFn: api.listSources });

  const [url, setUrl] = useState("");
  const [detected, setDetected] = useState<DetectResult | null>(null);
  const [name, setName] = useState("");
  const [topics, setTopics] = useState("");
  const [maxAgeDays, setMaxAgeDays] = useState(7);
  const [summaryParagraphs, setSummaryParagraphs] = useState(1);
  const [err, setErr] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editErr, setEditErr] = useState<string | null>(null);

  const detectMut = useMutation({
    mutationFn: () => api.detect(url),
    onSuccess: (d) => {
      setDetected(d);
      setName(d.name);
      setTopics(d.suggested_topics);
      setErr(null);
    },
    onError: (e: Error) => setErr(e.message),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.createSource({
        site_url: detected!.site_url,
        feed_url: detected!.feed_url,
        name,
        topics,
        max_age_days: maxAgeDays,
        summary_paragraphs: summaryParagraphs,
      }),
    onSuccess: () => {
      setUrl("");
      setDetected(null);
      setName("");
      setTopics("");
      setMaxAgeDays(7);
      setSummaryParagraphs(1);
      setErr(null);
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => api.deleteSource(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources"] }),
  });

  const toggleMut = useMutation({
    mutationFn: (s: Source) => api.updateSource(s.id, { active: !s.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources"] }),
  });

  const updateSourceMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<EditForm> }) => api.updateSource(id, patch),
    onSuccess: () => {
      setEditingId(null);
      setEditForm(null);
      setEditErr(null);
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: (e: Error) => setEditErr(e.message),
  });

  return (
    <div className="sources">
      <section className="card add-source">
        <h2>Añadir web</h2>
        <div className="row">
          <input
            placeholder="p.ej. motorpasion.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && url && detectMut.mutate()}
          />
          <button onClick={() => detectMut.mutate()} disabled={!url || detectMut.isPending}>
            {detectMut.isPending ? "Detectando…" : "Detectar"}
          </button>
        </div>
        {err && <p className="error">{err}</p>}

        {detected && (
          <div className="detected">
            <label>
              Nombre
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Temas (separados por coma)
              <input value={topics} onChange={(e) => setTopics(e.target.value)} />
            </label>
            <label>
              Días de antigüedad máxima
              <input
                type="number"
                min={1}
                max={365}
                value={maxAgeDays}
                onChange={(e) => setMaxAgeDays(Number(e.target.value))}
              />
            </label>
            <label>
              Párrafos del resumen
              <select value={summaryParagraphs} onChange={(e) => setSummaryParagraphs(Number(e.target.value))}>
                <option value={1}>1 párrafo</option>
                <option value={2}>2 párrafos</option>
                <option value={3}>3 párrafos</option>
              </select>
            </label>
            <p className="muted">Solo se mostrarán noticias sobre estos temas. Feed: {detected.feed_url}</p>
            <button onClick={() => createMut.mutate()} disabled={!topics.trim() || createMut.isPending}>
              {createMut.isPending ? "Guardando…" : "Guardar web"}
            </button>
          </div>
        )}
      </section>

      <section className="source-list">
        <h2>Tus webs</h2>
        {sources && sources.length === 0 && <p className="muted">Aún no has añadido ninguna web.</p>}
        {sources?.map((s) => (
          <div key={s.id} className={`card source-item ${s.active ? "" : "inactive"}`}>
            {editingId === s.id && editForm ? (
              <div className="source-edit">
                <label>
                  Nombre
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </label>
                <label>
                  URL de la web
                  <input
                    value={editForm.site_url}
                    onChange={(e) => setEditForm({ ...editForm, site_url: e.target.value })}
                  />
                </label>
                <label>
                  URL del feed RSS/Atom
                  <input
                    value={editForm.feed_url}
                    onChange={(e) => setEditForm({ ...editForm, feed_url: e.target.value })}
                  />
                </label>
                <label>
                  Temas (separados por coma)
                  <input
                    value={editForm.topics}
                    onChange={(e) => setEditForm({ ...editForm, topics: e.target.value })}
                  />
                </label>
                <label>
                  Temas vetados (separados por coma)
                  <input
                    value={editForm.vetoed_topics}
                    placeholder="ninguno"
                    onChange={(e) => setEditForm({ ...editForm, vetoed_topics: e.target.value })}
                  />
                </label>
                <label>
                  Días de antigüedad máxima
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={editForm.max_age_days}
                    onChange={(e) => setEditForm({ ...editForm, max_age_days: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Párrafos del resumen
                  <select
                    value={editForm.summary_paragraphs}
                    onChange={(e) => setEditForm({ ...editForm, summary_paragraphs: Number(e.target.value) })}
                  >
                    <option value={1}>1 párrafo</option>
                    <option value={2}>2 párrafos</option>
                    <option value={3}>3 párrafos</option>
                  </select>
                </label>
                {editErr && <p className="error">{editErr}</p>}
                <div className="row">
                  <button
                    onClick={() => updateSourceMut.mutate({ id: s.id, patch: editForm })}
                    disabled={updateSourceMut.isPending || !editForm.name.trim() || !editForm.topics.trim()}
                  >
                    {updateSourceMut.isPending ? "Guardando…" : "Guardar"}
                  </button>
                  <button
                    className="link-btn"
                    onClick={() => {
                      setEditingId(null);
                      setEditForm(null);
                      setEditErr(null);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="source-info">
                  <div className="source-name">{s.name}</div>
                  <div className="muted">{s.topics}</div>
                  {s.vetoed_topics && <div className="muted vetoed-line">Vetados: {s.vetoed_topics}</div>}
                  <div className="muted">
                    Últimos {s.max_age_days} días
                    {" · "}
                    Resumen de {s.summary_paragraphs} {s.summary_paragraphs === 1 ? "párrafo" : "párrafos"}
                    {" · "}
                    <button
                      className="link-btn"
                      onClick={() => {
                        setEditingId(s.id);
                        setEditForm(toEditForm(s));
                        setEditErr(null);
                      }}
                    >
                      Editar
                    </button>
                  </div>
                </div>
                <div className="source-actions">
                  <button onClick={() => toggleMut.mutate(s)}>{s.active ? "Desactivar" : "Activar"}</button>
                  <button
                    className="danger"
                    onClick={() => {
                      if (confirm(`¿Borrar "${s.name}" y sus noticias?`)) delMut.mutate(s.id);
                    }}
                  >
                    Borrar
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

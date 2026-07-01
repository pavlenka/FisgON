import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type DetectResult, type Source } from "../api";

export default function SourcesPage() {
  const queryClient = useQueryClient();
  const { data: sources } = useQuery({ queryKey: ["sources"], queryFn: api.listSources });

  const [url, setUrl] = useState("");
  const [detected, setDetected] = useState<DetectResult | null>(null);
  const [name, setName] = useState("");
  const [topics, setTopics] = useState("");
  const [err, setErr] = useState<string | null>(null);

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
      }),
    onSuccess: () => {
      setUrl("");
      setDetected(null);
      setName("");
      setTopics("");
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
            <div className="source-info">
              <div className="source-name">{s.name}</div>
              <div className="muted">{s.topics}</div>
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
          </div>
        ))}
      </section>
    </div>
  );
}

// Tarjeta fantasma con brillo animado: se muestra mientras cargan las
// noticias para que se entienda qué forma tendrá el contenido.
export default function SkeletonCard() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <div className="sk-image" />
      <div className="sk-line sk-meta" />
      <div className="sk-line sk-title" />
      <div className="sk-line" />
      <div className="sk-line" />
      <div className="sk-line sk-short" />
    </div>
  );
}

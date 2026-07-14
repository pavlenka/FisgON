// Saltar de noticia en noticia con efecto de bloc de notas físico: al avanzar,
// la tarjeta actual se "arranca" girando sobre su borde superior (como quitar
// un post-it) y debajo aparece la siguiente; al retroceder, la hoja anterior
// se vuelve a posar sobre el bloc.
//
// Técnica: se clona la tarjeta como capa fija sobre su posición en pantalla,
// se salta el scroll al destino al instante (la siguiente hoja ya está
// debajo) y el clon se anima con rotateX sobre el borde superior. Así el
// scroll real nunca se pelea con la animación.

// Separación entre el borde superior del viewport y la tarjeta al aterrizar.
const READING_OFFSET = 78;
const PEEL_MS = 400;

function cards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".feed .card:not(.skeleton-card)")];
}

function currentIndex(list: HTMLElement[]): number {
  // La tarjeta "actual" es la primera cuyo borde inferior sigue por debajo
  // de la línea de lectura.
  for (let i = 0; i < list.length; i++) {
    if (list[i].getBoundingClientRect().bottom > READING_OFFSET + 20) return i;
  }
  return list.length - 1;
}

function makeLayer(card: HTMLElement, rect: DOMRect): { layer: HTMLDivElement; clone: HTMLElement } {
  const layer = document.createElement("div");
  layer.className = "page-turn-layer";
  layer.style.top = `${rect.top}px`;
  layer.style.left = `${rect.left}px`;
  layer.style.width = `${rect.width}px`;
  layer.style.height = `${rect.height}px`;
  const clone = card.cloneNode(true) as HTMLElement;
  clone.style.width = "100%";
  clone.style.margin = "0";
  layer.appendChild(clone);
  document.body.appendChild(layer);
  return { layer, clone };
}

function cleanup(layer: HTMLElement, hidden?: HTMLElement) {
  if (hidden) hidden.style.visibility = "";
  layer.remove();
}

let turning = false;

/** Salta a la noticia siguiente (dir=1) o anterior (dir=-1). */
export function turnPage(dir: 1 | -1) {
  if (turning) return;
  const list = cards();
  if (list.length === 0) return;
  const idx = currentIndex(list);
  const target = Math.min(Math.max(idx + dir, 0), list.length - 1);
  if (target === idx && dir === 1) return; // ya en la última
  const targetCard = list[target];
  const targetTop = targetCard.getBoundingClientRect().top + window.scrollY - READING_OFFSET;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    window.scrollTo({ top: Math.max(targetTop, 0), behavior: "auto" });
    return;
  }
  turning = true;

  let finished = false;
  const finish = (layer: HTMLElement, hidden?: HTMLElement) => () => {
    if (finished) return;
    finished = true;
    cleanup(layer, hidden);
    turning = false;
  };

  if (dir === 1) {
    // Avanzar: la hoja actual se arranca hacia arriba y revela la siguiente.
    const current = list[idx];
    const rect = current.getBoundingClientRect();
    const { layer, clone } = makeLayer(current, rect);
    window.scrollTo({ top: Math.max(targetTop, 0), behavior: "auto" });
    clone.classList.add("peel-out");
    const done = finish(layer);
    clone.addEventListener("animationend", done, { once: true });
    setTimeout(done, PEEL_MS + 250); // por si animationend no llega
  } else {
    // Retroceder: saltamos ya y la hoja anterior "se posa" sobre el bloc.
    window.scrollTo({ top: Math.max(targetTop, 0), behavior: "auto" });
    const rect = targetCard.getBoundingClientRect();
    const { layer, clone } = makeLayer(targetCard, rect);
    targetCard.style.visibility = "hidden";
    clone.classList.add("peel-in");
    const done = finish(layer, targetCard);
    clone.addEventListener("animationend", done, { once: true });
    setTimeout(done, PEEL_MS + 250);
  }
}

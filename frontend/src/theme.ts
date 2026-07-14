// Tema visual: claro/oscuro + color de acento. La verdad vive en las
// preferencias del usuario (BD); aquí se aplica al documento y se cachea en
// localStorage para que no haya destello de tema equivocado al arrancar.

export type Theme = "dark" | "light";
export type Accent = "amber" | "red" | "green" | "blue";

export const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "amber", label: "Ámbar", color: "#e9a13b" },
  { id: "red", label: "Teja", color: "#e05545" },
  { id: "green", label: "Verde", color: "#58a86a" },
  { id: "blue", label: "Azul", color: "#5b8fd6" },
];

const THEME_KEY = "fisgon_theme";
const ACCENT_KEY = "fisgon_accent";

export function applyTheme(theme: Theme, accent: Accent) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
  localStorage.setItem(THEME_KEY, theme);
  localStorage.setItem(ACCENT_KEY, accent);
}

/** Aplica el tema cacheado (o el de por defecto) antes del primer render. */
export function applyCachedTheme() {
  const theme = (localStorage.getItem(THEME_KEY) as Theme) || "dark";
  const accent = (localStorage.getItem(ACCENT_KEY) as Accent) || "amber";
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
}

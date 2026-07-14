import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import LoginPage from "./pages/LoginPage";
import FeedPage from "./pages/FeedPage";
import FavoritesPage from "./pages/FavoritesPage";
import SourcesPage from "./pages/SourcesPage";
import AnalyzedPage from "./pages/AnalyzedPage";
import DashboardPage from "./pages/DashboardPage";
import AccountPage from "./pages/AccountPage";
import VerifyPage from "./pages/VerifyPage";
import ResetPage from "./pages/ResetPage";
import RegisterPage from "./pages/RegisterPage";

// Iconos de trazo para la barra inferior móvil (heredan el color del enlace).
const ICONS = {
  feed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h13v14H6a2 2 0 0 1-2-2V5Z" />
      <path d="M17 8h3v9a2 2 0 0 1-2 2h-1" />
      <path d="M7.5 9h6M7.5 12.5h6M7.5 16h4" />
    </svg>
  ),
  favorites: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4Z" />
    </svg>
  ),
  sources: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12a7 7 0 0 1 7 7" />
      <path d="M5 6a13 13 0 0 1 13 13" />
      <circle cx="5.5" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
  analyzed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6.5h9M4 12h9M4 17.5h5" />
      <path d="m15.5 12.5 2.2 2.2 4-4.5" />
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 19V10M12 19V5M19 19v-6" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 5V4a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 4v16A1.5 1.5 0 0 0 5 21.5h7.5A1.5 1.5 0 0 0 14 20v-1" />
      <path d="M9.5 12h11M17 8.5l3.5 3.5-3.5 3.5" />
    </svg>
  ),
};

function Shell() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Fisg<span className="on">ON</span>
        </div>
        <nav>
          <NavLink to="/" end>
            {ICONS.feed}
            Noticias
          </NavLink>
          <NavLink to="/favoritas">
            {ICONS.favorites}
            Favoritas
          </NavLink>
          <NavLink to="/fuentes">
            {ICONS.sources}
            Fuentes
          </NavLink>
          <NavLink to="/analizadas">
            {ICONS.analyzed}
            Analizadas
          </NavLink>
          {user?.is_admin && (
            <NavLink to="/dashboard">
              {ICONS.dashboard}
              Dashboard
            </NavLink>
          )}
          {user && (
            <NavLink to="/cuenta" className="user-name">
              {ICONS.account}
              {user.name}
            </NavLink>
          )}
          <button className="link-btn" onClick={logout}>
            {ICONS.logout}
            Salir
          </button>
        </nav>
      </header>
      <main className="content">
        {/* key por ruta: cada página entra con un fundido corto */}
        <div className="page-fade" key={location.pathname}>
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/favoritas" element={<FavoritesPage />} />
            <Route path="/fuentes" element={<SourcesPage />} />
            <Route path="/analizadas" element={<AnalyzedPage />} />
            <Route path="/dashboard" element={user?.is_admin ? <DashboardPage /> : <Navigate to="/" replace />} />
            <Route path="/cuenta" element={<AccountPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      {/* Barra de pestañas inferior, solo en móvil: ocupa menos que el menú
          de dos líneas y deja los destinos a un pulgar de distancia. */}
      <nav className="tabbar">
        <NavLink to="/" end>
          {ICONS.feed}
          <span>Noticias</span>
        </NavLink>
        <NavLink to="/favoritas">
          {ICONS.favorites}
          <span>Favoritas</span>
        </NavLink>
        <NavLink to="/fuentes">
          {ICONS.sources}
          <span>Fuentes</span>
        </NavLink>
        <NavLink to="/analizadas">
          {ICONS.analyzed}
          <span>Analizadas</span>
        </NavLink>
        {user?.is_admin && (
          <NavLink to="/dashboard">
            {ICONS.dashboard}
            <span>Panel</span>
          </NavLink>
        )}
        <NavLink to="/cuenta">
          {ICONS.account}
          <span>Cuenta</span>
        </NavLink>
      </nav>
    </div>
  );
}

export default function App() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-screen">
        <p className="muted">Cargando…</p>
      </div>
    );
  }

  return (
    <Routes>
      {/* Rutas públicas: llegan desde los enlaces de los correos, sin sesión. */}
      <Route path="/verificar" element={<VerifyPage />} />
      <Route path="/restablecer" element={<ResetPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route path="*" element={token ? <Shell /> : <LoginPage />} />
    </Routes>
  );
}

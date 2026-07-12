import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import LoginPage from "./pages/LoginPage";
import FeedPage from "./pages/FeedPage";
import SourcesPage from "./pages/SourcesPage";
import AnalyzedPage from "./pages/AnalyzedPage";
import DashboardPage from "./pages/DashboardPage";
import AccountPage from "./pages/AccountPage";
import VerifyPage from "./pages/VerifyPage";
import ResetPage from "./pages/ResetPage";
import RegisterPage from "./pages/RegisterPage";

function Shell() {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Fisg<span className="on">ON</span>
        </div>
        <nav>
          <Link to="/">Noticias</Link>
          <Link to="/fuentes">Fuentes</Link>
          <Link to="/analizadas">Analizadas</Link>
          {user?.is_admin && <Link to="/dashboard">Dashboard</Link>}
          {user && (
            <Link to="/cuenta" className="user-name">
              {user.name}
            </Link>
          )}
          <button className="link-btn" onClick={logout}>
            Salir
          </button>
        </nav>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<FeedPage />} />
          <Route path="/fuentes" element={<SourcesPage />} />
          <Route path="/analizadas" element={<AnalyzedPage />} />
          <Route path="/dashboard" element={user?.is_admin ? <DashboardPage /> : <Navigate to="/" replace />} />
          <Route path="/cuenta" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
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

import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import LoginPage from "./pages/LoginPage";
import FeedPage from "./pages/FeedPage";
import SourcesPage from "./pages/SourcesPage";
import DashboardPage from "./pages/DashboardPage";
import AccountPage from "./pages/AccountPage";

export default function App() {
  const { token, user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="auth-screen">
        <p className="muted">Cargando…</p>
      </div>
    );
  }

  if (!token) return <LoginPage />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🕵️ FisgON</div>
        <nav>
          <Link to="/">Noticias</Link>
          <Link to="/fuentes">Fuentes</Link>
          <Link to="/dashboard">Dashboard</Link>
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
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/cuenta" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

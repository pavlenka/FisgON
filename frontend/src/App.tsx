import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import LoginPage from "./pages/LoginPage";
import FeedPage from "./pages/FeedPage";
import SourcesPage from "./pages/SourcesPage";

export default function App() {
  const { token, logout } = useAuth();

  if (!token) return <LoginPage />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🕵️ FisgON</div>
        <nav>
          <Link to="/">Noticias</Link>
          <Link to="/fuentes">Fuentes</Link>
          <button className="link-btn" onClick={logout}>
            Salir
          </button>
        </nav>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<FeedPage />} />
          <Route path="/fuentes" element={<SourcesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

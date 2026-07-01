import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";

const MIN_PASSWORD_LENGTH = 8;

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    if (mode === "register") {
      if (!name.trim()) {
        setErr("El nombre es obligatorio");
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        setErr(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name.trim());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-big">🕵️ FisgON</div>
        <p className="muted">Tus noticias filtradas y sin clickbait.</p>
        {mode === "register" && (
          <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {err && <p className="error">{err}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setErr(null);
            setMode(mode === "login" ? "register" : "login");
          }}
        >
          {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Entra"}
        </button>
      </form>
    </div>
  );
}

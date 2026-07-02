import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setErr(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
      return;
    }
    if (password !== confirm) {
      setErr("Las contraseñas no coinciden");
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(token ?? "", password);
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-big">
          Fisg<span className="on">ON</span>
        </div>
        {done ? (
          <>
            <p className="muted" style={{ textAlign: "center" }}>
              Contraseña restablecida. Ya puedes iniciar sesión con la nueva.
            </p>
            <Link className="link-btn" style={{ textAlign: "center" }} to="/">
              Ir a iniciar sesión
            </Link>
          </>
        ) : (
          <>
            <p className="tagline">Elige una contraseña nueva.</p>
            <input
              type="password"
              placeholder="Contraseña nueva"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Repite la contraseña"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {err && <p className="error">{err}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "…" : "Guardar contraseña"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../api";

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterPage() {
  const [params] = useSearchParams();
  const inviteToken = params.get("invite") ?? "";
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) { setErr("El nombre es obligatorio"); return; }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setErr(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
      return;
    }
    setBusy(true);
    try {
      await api.registerWithInvite(inviteToken, email.trim().toLowerCase(), password, name.trim());
      navigate("/", { replace: true, state: { info: "Cuenta creada. Ya puedes iniciar sesión." } });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!inviteToken) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-big">Fisg<span className="on">ON</span></div>
          <p className="error">Este enlace no es válido. Pide una invitación al administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="mascot" aria-hidden="true">🕵️</div>
        <div className="brand-big">Fisg<span className="on">ON</span></div>
        <p className="tagline">Crea tu cuenta con tu invitación.</p>
        <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p className="error">{err}</p>}
        <button type="submit" disabled={busy}>{busy ? "…" : "Crear cuenta"}</button>
      </form>
    </div>
  );
}

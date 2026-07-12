import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

// El registro es solo por invitación: el admin envía un enlace por correo que
// lleva a /registro?invite=TOKEN. Aquí solo hay login y recuperar contraseña.
type Mode = "login" | "forgot";

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // El backend responde 403 con este texto cuando la cuenta existe pero
  // el correo sigue sin confirmar: ofrecemos reenviar el enlace.
  const needsVerification = err !== null && err.includes("verificado");

  function switchMode(next: Mode) {
    setErr(null);
    setInfo(null);
    setMode(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        const res = await api.forgotPassword(email);
        setInfo(res.message);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.resendVerification(email);
      setInfo(res.message);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="mascot" aria-hidden="true">
          🕵️
        </div>
        <div className="brand-big">
          Fisg<span className="on">ON</span>
        </div>
        <p className="tagline">Tus noticias filtradas y sin clickbait.</p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {mode !== "forgot" && (
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}
        {err && <p className="error">{err}</p>}
        {info && <p className="muted">{info}</p>}
        {needsVerification && (
          <button type="button" className="link-btn" onClick={resend} disabled={busy}>
            Reenviar correo de verificación
          </button>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Entrar" : "Enviar enlace"}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => switchMode(mode === "login" ? "forgot" : "login")}
        >
          {mode === "login" ? "¿Has olvidado tu contraseña?" : "Volver a entrar"}
        </button>
        <p className="muted">El registro es solo por invitación.</p>
      </form>
    </div>
  );
}

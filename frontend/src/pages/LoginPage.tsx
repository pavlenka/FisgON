import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

const MIN_PASSWORD_LENGTH = 8;

type Mode = "login" | "register" | "forgot";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
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
      if (mode === "login") {
        await login(email, password);
      } else if (mode === "register") {
        await register(email, password, name.trim());
        setMode("login");
        setInfo("Cuenta creada. Te hemos enviado un correo con el enlace para activarla.");
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
          {busy ? "…" : mode === "login" ? "Entrar" : mode === "register" ? "Crear cuenta" : "Enviar enlace"}
        </button>
        {mode === "login" && (
          <button type="button" className="link-btn" onClick={() => switchMode("forgot")}>
            ¿Has olvidado tu contraseña?
          </button>
        )}
        <button
          type="button"
          className="link-btn"
          onClick={() => switchMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Entra"}
        </button>
      </form>
    </div>
  );
}

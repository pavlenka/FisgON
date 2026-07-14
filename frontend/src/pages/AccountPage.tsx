import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type UserPatch } from "../api";
import { useAuth } from "../auth";
import { ACCENTS, applyTheme, type Accent, type Theme } from "../theme";

// Preferencias de la cuenta: etiqueta y explicación de cada interruptor.
type BoolPref = "pref_favorite_extended" | "pref_favorite_images" | "pref_email_extended" | "pref_extended_open";
const PREFS: { key: BoolPref; label: string; hint: string }[] = [
  {
    key: "pref_favorite_extended",
    label: "Informe completo al guardar para más tarde",
    hint: "Genera el informe automáticamente al guardar una noticia en Leer más tarde.",
  },
  {
    key: "pref_favorite_images",
    label: "Fotos adicionales al guardar para más tarde",
    hint: "Busca más fotos del artículo y las muestra en una galería.",
  },
  {
    key: "pref_email_extended",
    label: "Informe completo al enviar al correo",
    hint: "El correo incluye el informe; si no existe, se genera antes de enviar.",
  },
  {
    key: "pref_extended_open",
    label: "Informe desplegado en las tarjetas",
    hint: "Si lo apagas, el informe aparece plegado y se abre al tocarlo.",
  },
];

export default function AccountPage() {
  const { user, refreshUser, logout } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [nameMsg, setNameMsg] = useState<string | null>(null);

  // Si esta página monta antes de que /me haya resuelto (p.ej. justo tras
  // login), user llega después del primer render: sincronizamos el campo
  // cuando el nombre real esté disponible.
  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErr, setPasswordErr] = useState<string | null>(null);

  const nameMut = useMutation({
    mutationFn: (n: string) => api.updateMe({ name: n }),
    onSuccess: async () => {
      await refreshUser();
      setNameMsg("Nombre actualizado.");
    },
    onError: (e: Error) => setNameMsg(e.message),
  });

  // Tema y color se aplican al momento (optimista) y se guardan en la cuenta.
  const theme = (user?.pref_theme as Theme) ?? "dark";
  const accent = (user?.pref_accent as Accent) ?? "amber";
  function savePrefTheme(patch: UserPatch) {
    applyTheme((patch.pref_theme as Theme) ?? theme, (patch.pref_accent as Accent) ?? accent);
    setPrefMsg(null);
    prefMut.mutate(patch);
  }

  // Las preferencias se guardan solas al cambiar cada interruptor.
  const [prefMsg, setPrefMsg] = useState<string | null>(null);
  const prefMut = useMutation({
    mutationFn: (patch: UserPatch) => api.updateMe(patch),
    onSuccess: async () => {
      await refreshUser();
      setPrefMsg("Guardado.");
    },
    onError: (e: Error) => setPrefMsg(e.message),
  });

  const passwordMut = useMutation({
    mutationFn: () => api.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      // El token sigue siendo válido (JWT no se revoca al cambiar la
      // contraseña), pero forzamos a volver a entrar para confirmar que la
      // contraseña nueva funciona y no dejar la sesión abierta por descuido.
      logout();
    },
    onError: (e: Error) => setPasswordErr(e.message),
  });

  const submitPassword = () => {
    setPasswordErr(null);
    if (newPassword.length < 8) {
      setPasswordErr("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr("Las contraseñas nuevas no coinciden");
      return;
    }
    passwordMut.mutate();
  };

  return (
    <div className="account">
      <section className="card">
        <h2>Mi cuenta</h2>
        <p className="muted">{user?.email}</p>
        <div className="account-form">
          <label>
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {nameMsg && <p className={nameMut.isError ? "error" : "muted"}>{nameMsg}</p>}
          <button
            onClick={() => {
              setNameMsg(null);
              nameMut.mutate(name);
            }}
            disabled={!name.trim() || name.trim() === user?.name || nameMut.isPending}
          >
            {nameMut.isPending ? "Guardando…" : "Guardar nombre"}
          </button>
        </div>
      </section>

      <section className="card">
        <h3>Preferencias</h3>
        <div className="prefs">
          <div className="pref-theme-row">
            <span className="pref-group-label">Tema</span>
            <div className="segmented">
              <button
                className={theme === "dark" ? "active" : ""}
                onClick={() => savePrefTheme({ pref_theme: "dark" })}
              >
                Oscuro
              </button>
              <button
                className={theme === "light" ? "active" : ""}
                onClick={() => savePrefTheme({ pref_theme: "light" })}
              >
                Claro
              </button>
            </div>
          </div>
          <div className="pref-theme-row">
            <span className="pref-group-label">Color</span>
            <div className="swatches">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  className={`swatch${accent === a.id ? " active" : ""}`}
                  style={{ background: a.color }}
                  title={a.label}
                  onClick={() => savePrefTheme({ pref_accent: a.id })}
                />
              ))}
            </div>
          </div>
          {PREFS.map((p) => (
            <label key={p.key} className="pref-row">
              <input
                type="checkbox"
                checked={user?.[p.key] ?? true}
                disabled={prefMut.isPending}
                onChange={(e) => {
                  setPrefMsg(null);
                  prefMut.mutate({ [p.key]: e.target.checked });
                }}
              />
              <span>
                {p.label}
                <small>{p.hint}</small>
              </span>
            </label>
          ))}
          {prefMsg && <p className={prefMut.isError ? "error" : "muted"}>{prefMsg}</p>}
        </div>
      </section>

      <section className="card">
        <h3>Cambiar contraseña</h3>
        <div className="account-form">
          <label>
            Contraseña actual
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label>
            Contraseña nueva
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <label>
            Repite la contraseña nueva
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
          {passwordErr && <p className="error">{passwordErr}</p>}
          <button
            onClick={submitPassword}
            disabled={!currentPassword || !newPassword || !confirmPassword || passwordMut.isPending}
          >
            {passwordMut.isPending ? "Cambiando…" : "Cambiar contraseña"}
          </button>
        </div>
      </section>

      {/* En móvil el "Salir" de la cabecera no se ve (la navegación vive en
          la barra inferior): esta es la salida accesible desde Cuenta. */}
      <section className="card">
        <button className="danger" onClick={logout}>
          Cerrar sesión
        </button>
      </section>
    </div>
  );
}

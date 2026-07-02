import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { useAuth } from "../auth";

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
    mutationFn: (n: string) => api.updateMe(n),
    onSuccess: async () => {
      await refreshUser();
      setNameMsg("Nombre actualizado.");
    },
    onError: (e: Error) => setNameMsg(e.message),
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
    </div>
  );
}

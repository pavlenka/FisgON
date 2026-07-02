import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";

export default function VerifyPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Verificando tu correo…");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Falta el código de verificación en el enlace.");
      return;
    }
    api
      .verifyEmail(token)
      .then((res) => {
        setStatus("ok");
        setMessage(res.message);
      })
      .catch((e: Error) => {
        setStatus("error");
        setMessage(e.message);
      });
  }, [token]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand-big">
          Fisg<span className="on">ON</span>
        </div>
        <p className={status === "error" ? "error" : "muted"} style={{ textAlign: "center" }}>
          {message}
        </p>
        {status !== "working" && (
          <Link className="link-btn" style={{ textAlign: "center" }} to="/">
            Ir a iniciar sesión
          </Link>
        )}
      </div>
    </div>
  );
}

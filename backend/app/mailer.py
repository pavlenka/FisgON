"""Envío de correo transaccional: verificación de cuenta y reseteo de contraseña.

SMTP sobre SSL (privateemail.com). La contraseña vive solo en .env; si no está
configurada, se registra un aviso y no se envía nada (útil en desarrollo).
Los fallos se loguean y no se propagan: se llama desde BackgroundTasks y un
error de correo nunca debe romper la petición que lo originó.
"""
import logging
import smtplib
from datetime import datetime
from email.message import EmailMessage

from .config import settings

log = logging.getLogger("fisgon.mailer")


def _send(to: str, subject: str, body: str, html: str | None = None) -> bool:
    """Envía un correo. Devuelve True si el servidor SMTP lo aceptó."""
    if not settings.smtp_password:
        log.warning("SMTP sin configurar: no se envía '%s' a %s", subject, to)
        return False
    msg = EmailMessage()
    msg["From"] = f"FisgON <{settings.smtp_from}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        # 465 = SSL implícito; cualquier otro puerto (587) = STARTTLS. El VPS
        # de producción (Hetzner) bloquea el 465 saliente, así que en prod se
        # usa 587.
        if settings.smtp_port == 465:
            smtp = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20)
        else:
            smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
            smtp.starttls()
        with smtp:
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        log.info("Correo '%s' enviado a %s", subject, to)
        return True
    except Exception:  # noqa: BLE001 - el correo nunca debe tumbar la petición
        log.exception("No se pudo enviar '%s' a %s", subject, to)
        return False


def send_verification(to: str, name: str, token: str) -> None:
    url = f"{settings.app_base_url}/verificar?token={token}"
    _send(
        to,
        "Verifica tu cuenta de FisgON",
        f"Hola {name},\n\n"
        "Gracias por crear una cuenta en FisgON. Para activarla, confirma tu correo\n"
        f"abriendo este enlace:\n\n{url}\n\n"
        "Si no has creado esta cuenta, puedes ignorar este mensaje.\n\n"
        "— FisgON",
    )


def send_password_reset(to: str, name: str, token: str) -> None:
    url = f"{settings.app_base_url}/restablecer?token={token}"
    _send(
        to,
        "Restablece tu contraseña de FisgON",
        f"Hola {name},\n\n"
        "Hemos recibido una petición para restablecer tu contraseña. Puedes elegir\n"
        f"una nueva abriendo este enlace (caduca en 1 hora):\n\n{url}\n\n"
        "Si no has pedido este cambio, puedes ignorar este mensaje: tu contraseña\n"
        "seguirá siendo la misma.\n\n"
        "— FisgON",
    )


_MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def send_article(
    to: str,
    *,
    source_name: str,
    title: str,
    summary: str,
    extended_summary: str | None,
    link: str,
    published_at: datetime,
    image_url: str | None,
) -> bool:
    """Envía una noticia al correo del usuario con el mismo formato que la
    tarjeta de la web (para leerla más tarde o reenviarla)."""
    fecha = f"{published_at.day} {_MESES[published_at.month - 1]} {published_at.year}"

    plain = f"{source_name} · {fecha}\n\n{title}\n\n{summary}\n"
    if extended_summary:
        plain += f"\nINFORME COMPLETO\n\n{extended_summary}\n"
    plain += f"\nLeer en la fuente: {link}\n\n— Enviado desde FisgON ({settings.app_base_url})"

    def esc(text: str) -> str:
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    extended_html = ""
    if extended_summary:
        parrafos = "".join(
            f'<p style="margin:0 0 12px;color:#d9cdb8;font-size:16px;line-height:1.55;">{esc(p)}</p>'
            for p in extended_summary.split("\n")
            if p.strip()
        )
        extended_html = (
            '<div style="border-top:1px solid #322818;margin-top:16px;padding-top:14px;">'
            '<div style="color:#e9a13b;font-size:11px;font-weight:600;letter-spacing:2px;'
            'text-transform:uppercase;margin-bottom:8px;">Informe completo</div>'
            f"{parrafos}</div>"
        )

    imagen_html = (
        f'<img src="{image_url}" alt="" style="width:100%;max-height:300px;object-fit:cover;'
        'border-radius:4px 4px 0 0;display:block;" />'
        if image_url
        else ""
    )

    html = f"""\
<div style="background:#0e0c08;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="font-size:20px;font-weight:800;color:#efe6d8;margin-bottom:14px;">
      Fisg<span style="color:#e9a13b;">ON</span>
    </div>
    <div style="background:#17130c;border:1px solid #322818;border-radius:4px;overflow:hidden;">
      {imagen_html}
      <div style="padding:18px 20px;">
        <div style="font-size:12px;margin-bottom:10px;">
          <span style="color:#e9a13b;font-weight:600;letter-spacing:1px;text-transform:uppercase;">{esc(source_name)}</span>
          <span style="color:#a08f73;"> · {fecha}</span>
        </div>
        <h1 style="margin:0 0 10px;color:#efe6d8;font-size:22px;line-height:1.3;">{esc(title)}</h1>
        <p style="margin:0;color:#d9cdb8;font-size:16px;line-height:1.55;">{esc(summary)}</p>
        {extended_html}
        <p style="margin:18px 0 0;">
          <a href="{link}" style="color:#e9a13b;font-size:13px;letter-spacing:1px;text-transform:uppercase;text-decoration:none;">Leer en la fuente &rarr;</a>
        </p>
      </div>
    </div>
    <p style="color:#a08f73;font-size:12px;margin-top:14px;">
      Enviado desde <a href="{settings.app_base_url}" style="color:#a08f73;">FisgON</a>, tus noticias sin clickbait.
    </p>
  </div>
</div>"""

    return _send(to, title, plain, html=html)

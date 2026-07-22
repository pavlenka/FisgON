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
    except Exception:  # noqa: BLE001
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


def send_invite(to: str, token: str) -> bool:
    url = f"{settings.app_base_url}/registro?invite={token}"
    html = f"""\
<div style="background:#f5f3ef;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="background:#0e0c08;padding:10px 16px;border-radius:4px;display:inline-block;margin-bottom:14px;">
      <span style="font-size:20px;font-weight:800;color:#efe6d8;">Fisg<span style="color:#e9a13b;">ON</span></span>
    </div>
    <div style="background:#ffffff;border:1px solid #ddd8d0;border-radius:4px;padding:24px;">
      <h1 style="margin:0 0 12px;color:#1a1510;font-size:22px;">Tienes una invitaci&oacute;n</h1>
      <p style="color:#2d2318;font-size:16px;line-height:1.55;margin:0 0 20px;">
        Te han invitado a unirte a <strong>FisgON</strong>, el agregador de noticias sin clickbait.
        La invitaci&oacute;n caduca en 7 d&iacute;as.
      </p>
      <a href="{url}" style="display:inline-block;background:#c47d0e;color:#ffffff;text-decoration:none;
        padding:12px 24px;border-radius:4px;font-weight:600;font-size:15px;">
        Crear mi cuenta
      </a>
    </div>
    <p style="color:#6b5e4a;font-size:12px;margin-top:14px;">
      <a href="{settings.app_base_url}" style="color:#6b5e4a;">FisgON</a>, tus noticias sin clickbait.
    </p>
  </div>
</div>"""
    return _send(
        to,
        "Te han invitado a FisgON",
        f"Has recibido una invitación para unirte a FisgON.\n\n"
        f"Crea tu cuenta aquí (caduca en 7 días):\n\n{url}\n\n— FisgON",
        html=html,
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
    shared_by: str | None = None,
) -> bool:
    """Envía una noticia al correo del usuario (tema claro: negro sobre blanco)."""
    fecha = f"{published_at.day} {_MESES[published_at.month - 1]} {published_at.year}"

    plain = f"{shared_by} quiere compartir esto contigo\n\n" if shared_by else ""
    plain += f"{source_name} · {fecha}\n\n{title}\n\n{summary}\n"
    if extended_summary:
        plain += f"\nINFORME COMPLETO\n\n{extended_summary}\n"
    plain += f"\nLeer en la fuente: {link}\n\n— Enviado desde FisgON ({settings.app_base_url})"

    def esc(text: str) -> str:
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    extended_html = ""
    if extended_summary:
        parrafos = "".join(
            f'<p style="margin:0 0 12px;color:#2d2318;font-size:16px;line-height:1.55;">{esc(p)}</p>'
            for p in extended_summary.split("\n")
            if p.strip()
        )
        extended_html = (
            '<div style="border-top:1px solid #ddd8d0;margin-top:16px;padding-top:14px;">'
            '<div style="color:#c47d0e;font-size:11px;font-weight:600;letter-spacing:2px;'
            'text-transform:uppercase;margin-bottom:8px;">Informe completo</div>'
            f"{parrafos}</div>"
        )

    imagen_html = (
        f'<img src="{image_url}" alt="" style="width:100%;max-height:300px;object-fit:cover;'
        'border-radius:4px 4px 0 0;display:block;" />'
        if image_url
        else ""
    )
    shared_html = (
        f'<p style="margin:0 0 16px;color:#1a1510;font-size:17px;font-weight:600;">'
        f"{esc(shared_by)} quiere compartir esto contigo</p>"
        if shared_by
        else ""
    )

    html = f"""\
<div style="background:#f5f3ef;padding:24px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;">
    {shared_html}
    <div style="background:#0e0c08;padding:10px 16px;border-radius:4px;display:inline-block;margin-bottom:14px;">
      <span style="font-size:20px;font-weight:800;color:#efe6d8;">Fisg<span style="color:#e9a13b;">ON</span></span>
    </div>
    <div style="background:#ffffff;border:1px solid #ddd8d0;border-radius:4px;overflow:hidden;">
      {imagen_html}
      <div style="padding:18px 20px;">
        <div style="font-size:12px;margin-bottom:10px;">
          <span style="color:#c47d0e;font-weight:600;letter-spacing:1px;text-transform:uppercase;">{esc(source_name)}</span>
          <span style="color:#6b5e4a;"> · {fecha}</span>
        </div>
        <h1 style="margin:0 0 10px;color:#1a1510;font-size:22px;line-height:1.3;">{esc(title)}</h1>
        <p style="margin:0;color:#2d2318;font-size:16px;line-height:1.55;">{esc(summary)}</p>
        {extended_html}
        <p style="margin:18px 0 0;">
          <a href="{link}" style="color:#c47d0e;font-size:13px;letter-spacing:1px;text-transform:uppercase;text-decoration:none;">Leer en la fuente &rarr;</a>
        </p>
      </div>
    </div>
    <p style="color:#6b5e4a;font-size:12px;margin-top:14px;">
      Enviado desde <a href="{settings.app_base_url}" style="color:#6b5e4a;">FisgON</a>, tus noticias sin clickbait.
    </p>
  </div>
</div>"""

    return _send(to, title, plain, html=html)

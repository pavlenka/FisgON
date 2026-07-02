"""Envío de correo transaccional: verificación de cuenta y reseteo de contraseña.

SMTP sobre SSL (privateemail.com). La contraseña vive solo en .env; si no está
configurada, se registra un aviso y no se envía nada (útil en desarrollo).
Los fallos se loguean y no se propagan: se llama desde BackgroundTasks y un
error de correo nunca debe romper la petición que lo originó.
"""
import logging
import smtplib
from email.message import EmailMessage

from .config import settings

log = logging.getLogger("fisgon.mailer")


def _send(to: str, subject: str, body: str) -> None:
    if not settings.smtp_password:
        log.warning("SMTP sin configurar: no se envía '%s' a %s", subject, to)
        return
    msg = EmailMessage()
    msg["From"] = f"FisgON <{settings.smtp_from}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
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
    except Exception:  # noqa: BLE001 - el correo nunca debe tumbar la petición
        log.exception("No se pudo enviar '%s' a %s", subject, to)


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

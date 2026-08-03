const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { saveDB } = require("./db");
const { getSede } = require("./sedes");

const HOUR_MS = 3600 * 1000;
const REMINDER_HOURS_BEFORE = 24;

const EMAIL_FROM = process.env.EMAIL_FROM;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

function estaConfigurado() {
  return Boolean(EMAIL_FROM && SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function crearTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function bogotaToUtc(fecha, hora) {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh + 5, mm, 0);
}

function fechaLegible(fecha) {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-CO", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function generarContenidoEmail(cita) {
  const fecha = cita.fecha;
  const leer = fechaLegible(fecha);
  const sede = getSede(cita.sede);
  const token = cita.confirm_token || "";
  const confirmarUrl = token ? `${baseUrl()}/confirmar?token=${encodeURIComponent(token)}` : "#";
  const cancelarUrl = token ? `${baseUrl()}/cancelar?token=${encodeURIComponent(token)}` : "#";

  const dentistaLinea = cita.dentista
    ? `<p><strong>Dentista:</strong> ${escapeHtml(cita.dentista)}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Recordatorio de tu cita - Sonrisa Sana</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#082f49,#0c4a6e);padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;">Clinica Dental Sonrisa Sana</h1>
              <p style="margin:4px 0 0;color:#bae6fd;font-size:13px;">Recordatorio de cita</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <h2 style="margin:0 0 6px;color:#0f172a;font-size:18px;">Hola ${escapeHtml(cita.nombre)}</h2>
              <p style="margin:0 0 16px;color:#475569;font-size:14px;">Te recordamos que tienes una cita con nosotros:</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
                <tr>
                  <td style="padding:4px 0;color:#475569;font-size:13px;width:110px;">Servicio</td>
                  <td style="padding:4px 0;color:#0f172a;font-size:14px;font-weight:600;">${escapeHtml(cita.servicio)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#475569;font-size:13px;">Fecha</td>
                  <td style="padding:4px 0;color:#0f172a;font-size:14px;">${escapeHtml(leer)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#475569;font-size:13px;">Hora</td>
                  <td style="padding:4px 0;color:#0f172a;font-size:14px;">${escapeHtml(cita.hora)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#475569;font-size:13px;">Sede</td>
                  <td style="padding:4px 0;color:#0f172a;font-size:14px;">${escapeHtml(sede.nombre)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#475569;font-size:13px;">Direccion</td>
                  <td style="padding:4px 0;color:#0f172a;font-size:14px;">${escapeHtml(sede.direccion)}</td>
                </tr>
                ${dentistaLinea ? `<tr><td style="padding:4px 0;color:#475569;font-size:13px;">Dentista</td><td style="padding:4px 0;color:#0f172a;font-size:14px;">${escapeHtml(cita.dentista)}</td></tr>` : ""}
              </table>
              <p style="margin:0 0 12px;color:#0f172a;font-size:14px;"><strong>Confirma tu asistencia:</strong></p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                <tr>
                  <td>
                    <a href="${confirmarUrl}" style="display:inline-block;background:#22c55e;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;">Si, confirmo mi asistencia</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 6px;color:#64748b;font-size:13px;">Si no puedes asistir, puedes <a href="${cancelarUrl}" style="color:#ef4444;">cancelar o reprogramar tu cita aqui</a> o escribirnos a este correo.</p>
              <p style="margin:0;color:#94a3b8;font-size:11px;">Si el enlace no funciona, copia y pega: ${baseUrl()}/confirmar?token=${escapeHtml(token)}</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:16px 32px;color:#64748b;font-size:12px;">Sonrisa Sana - A tu salud dental</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Hola ${cita.nombre},`,
    "",
    `Te recordamos que tienes una cita en la Clinica Dental Sonrisa Sana:`,
    "",
    `  Servicio: ${cita.servicio}`,
    `  Fecha: ${leer}`,
    `  Hora: ${cita.hora}`,
    `  Sede: ${sede.nombre}`,
    sede.direccion ? `  Direccion: ${sede.direccion}` : ``,
    cita.dentista ? `  Dentista: ${cita.dentista}` : "",
    "",
    `Para confirmar tu asistencia, abre: ${confirmarUrl}`,
    `Si no puedes asistir, cancela o reprograma: ${cancelarUrl}`,
    "",
    "Sonrisa Sana",
  ]
    .filter((l) => l !== true && l !== "")
    .join("\n");

  return {
    subject: `Recordatorio de tu cita en Sonrisa Sana - ${leer} ${cita.hora}`,
    text,
    html,
  };
}

async function enviarRecordatorio(cita) {
  if (!estaConfigurado()) return false;

  const transport = crearTransport();
  const contenido = generarContenidoEmail(cita);
  await transport.sendMail({
    from: EMAIL_FROM,
    to: cita.email,
    subject: contenido.subject,
    text: contenido.text,
    html: contenido.html,
  });
  return true;
}

function asegurarToken(db, cita) {
  if (cita.confirm_token) return cita;
  const token = crypto.randomBytes(32).toString("hex");
  db.run("UPDATE citas SET confirm_token = ? WHERE id = ?", [token, cita.id]);
  saveDB();
  return { ...cita, confirm_token: token };
}

async function correrRecordatorios(db, opts = {}) {
  const now = opts.now || new Date();
  const send = opts.send || enviarRecordatorio;
  const log = opts.log || ((level, msg, data) => {
    const entry = { level, msg, timestamp: new Date().toISOString(), ...(data && { data }) };
    if (level === "error") console.error(JSON.stringify(entry));
    else console.log(JSON.stringify(entry));
  });

  if (!estaConfigurado()) {
    log("info", "Recordatorios: SMTP no configurado, se omite el envio.", {
      hint: "Configura SMTP_HOST, SMTP_USER, SMTP_PASS y EMAIL_FROM en .env",
    });
    return { enviados: 0, omitidos: 0, configurado: false };
  }

  const ahora = now.getTime();
  const ventanaMs = REMINDER_HOURS_BEFORE * HOUR_MS;

  const stmt = db.prepare(
    "SELECT id, nombre, email, servicio, fecha, hora, dentista, sede, confirm_token, recordatorio_enviado FROM citas WHERE email IS NOT NULL AND (recordatorio_enviado IS NULL OR recordatorio_enviado = 0) ORDER BY fecha, hora"
  );
  let enviados = 0;
  let omitidos = 0;

  while (stmt.step()) {
    const cita = stmt.getAsObject();
    const citaUtc = bogotaToUtc(cita.fecha, cita.hora);
    const vence = citaUtc - ventanaMs;
    const pendiente = citaUtc > ahora && ahora >= vence;

    if (!pendiente) {
      omitidos++;
      continue;
    }

    try {
      let citaConToken = asegurarToken(db, cita);
      const enviado = await send(citaConToken);
      if (enviado) {
        db.run(
          "UPDATE citas SET recordatorio_enviado = 1, recordatorio_enviado_en = ? WHERE id = ?",
          [now.toISOString(), cita.id]
        );
        saveDB();
        enviados++;
        log("info", "Recordatorio enviado", { cita_id: cita.id, fecha: cita.fecha, hora: cita.hora });
      } else {
        omitidos++;
      }
    } catch (err) {
      log("error", "Error al enviar recordatorio", { cita_id: cita.id, error: err.message });
      omitidos++;
    }
  }
  stmt.free();

  return { enviados, omitidos, configurado: true };
}

module.exports = {
  correrRecordatorios,
  enviarRecordatorio,
  generarContenidoEmail,
  estaConfigurado,
  bogotaToUtc,
  asegurarToken,
  baseUrl,
  escapeHtml,
  fechaLegible,
  REMINDER_HOURS_BEFORE,
};

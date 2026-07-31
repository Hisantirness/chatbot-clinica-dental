const nodemailer = require("nodemailer");
const { saveDB } = require("./db");

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

function generarContenidoEmail(cita) {
  const fecha = cita.fecha;
  const [y, m, d] = fecha.split("-").map(Number);
  const fechaLegible = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-CO", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    subject: `Recordatorio de tu cita en Sonrisa Sana - ${fechaLegible} ${cita.hora}`,
    text: `Hola ${cita.nombre},

Te recordamos que tienes una cita en la Clinica Dental Sonrisa Sana:

  Servicio: ${cita.servicio}
  Fecha: ${fechaLegible}
  Hora: ${cita.hora}
  ${cita.dentista ? `Dentista: ${cita.dentista}\n  ` : ""}Ubicacion: Avenida 6 Norte, Cali.

Si no puedes asistir, responde a este correo o llama para reprogramar tu cita.

Sonrisa Sana`,
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
  });
  return true;
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
    "SELECT id, nombre, email, servicio, fecha, hora, dentista, recordatorio_enviado FROM citas WHERE email IS NOT NULL AND (recordatorio_enviado IS NULL OR recordatorio_enviado = 0) ORDER BY fecha, hora"
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
      const enviado = await send(cita);
      if (enviado) {
        db.run("UPDATE citas SET recordatorio_enviado = 1 WHERE id = ?", [cita.id]);
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
  REMINDER_HOURS_BEFORE,
};

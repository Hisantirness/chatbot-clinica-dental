require("dotenv").config();

const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");
const crypto = require("crypto");
const { systemPrompt } = require("./faq-context");
const { toolSchemas, availableFunctions, withWriteLock } = require("./tools");
const { getDB, saveDB } = require("./db");
const { correrRecordatorios } = require("./reminders");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const REMINDER_INTERVAL_MINUTES = Number(process.env.REMINDER_INTERVAL_MINUTES || 30);

const runningDirectly = require.main === module;

if (runningDirectly && !ADMIN_TOKEN) {
  console.warn("ADVERTENCIA: ADMIN_TOKEN no configurado. Los endpoints de citas no estan protegidos.");
  console.warn("Configuralo en .env: ADMIN_TOKEN=tu-token-secreto");
}

if (runningDirectly && !process.env.GROQ_API_KEY) {
  console.error("ERROR: GROQ_API_KEY no está configurada.");
  console.error("Crea un archivo .env en la raíz del proyecto con:");
  console.error('  GROQ_API_KEY=tu-api-key-de-groq');
  console.error("O configúrala como variable de entorno del sistema.");
  process.exit(1);
}

const groq = runningDirectly
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_HISTORY_LENGTH = 50;

function log(level, msg, data) {
  const entry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...(data && { data }),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

function sanitize(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[<>&"']/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function requestLogger(req, _res, next) {
  log("info", `${req.method} ${req.path}`, {
    ip: req.ip,
    ua: (req.headers["user-agent"] || "").slice(0, 60),
  });
  next();
}

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { reply: "Has excedido el límite de solicitudes. Espera un momento e intenta de nuevo." },
  standardHeaders: true,
  legacyHeaders: false,
});

function isRateLimitError(err) {
  return (
    err instanceof Groq.RateLimitError ||
    err.status === 429 ||
    (err.error && err.error.code === "rate_limit_exceeded")
  );
}

function isDailyQuotaError(err) {
  const msg = (err.message || err.error?.message || "").toLowerCase();
  return msg.includes("tokens per day") || msg.includes("tpd");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireAdmin(req, res, next) {
  const token = req.headers["authorization"]?.replace("Bearer ", "");
  if (!ADMIN_TOKEN) return next();
  if (!token) return res.status(401).json({ error: "No autorizado. Token requerido." });
  try {
    if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ADMIN_TOKEN))) {
      return res.status(401).json({ error: "No autorizado. Token invalido." });
    }
  } catch {
    return res.status(401).json({ error: "No autorizado. Token invalido." });
  }
  next();
}

function auditLog(action, details) {
  log("info", `[AUDIT] ${action}`, details);
}

function isValidPhone(phone) {
  return /^3\d{9}$/.test(phone);
}

function csvEscape(value) {
  let s = String(value == null ? "" : value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "font-src": ["'self'", "https:", "data:"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'self'"],
      "img-src": ["'self'", "data:"],
      "object-src": ["'none'"],
      "script-src": ["'self'"],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'", "https:"],
      "upgrade-insecure-requests": [],
    },
  },
}));
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  next();
});
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "https://chatbot-clinica-dental-production.up.railway.app")
  .split(",")
  .map((o) => o.trim());
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
}));
app.use(express.json({ limit: "10kb" }));
app.use(requestLogger);
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/api", apiLimiter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "admin.html"));
});

app.get("/api/admin/citas", requireAdmin, async (_req, res) => {
  try {
    const db = await getDB();
    const stmt = db.prepare("SELECT * FROM citas ORDER BY fecha, hora");
    const citas = [];
    while (stmt.step()) {
      citas.push(stmt.getAsObject());
    }
    stmt.free();
    auditLog("LISTAR_TODAS_CITAS", { count: citas.length });
    res.json({ citas });
  } catch (err) {
    log("error", "Error al listar citas", { error: err.message });
    res.status(500).json({ error: "Error al listar citas." });
  }
});

app.get("/api/admin/citas/export", requireAdmin, async (_req, res) => {
  try {
    const db = await getDB();
    const stmt = db.prepare("SELECT * FROM citas ORDER BY fecha, hora");
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    const header = "id,nombre,cedula,telefono,email,servicio,fecha,hora,dentista,creado_en";
    const csv = rows.map((r) =>
      [r.id, r.nombre, r.cedula, r.telefono, r.email || "", r.servicio, r.fecha, r.hora, r.dentista || "", r.creado_en].map(csvEscape).join(",")
    ).join("\n");

    auditLog("EXPORTAR_CITAS", { count: rows.length });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="citas-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`${header}\n${csv}`);
  } catch (err) {
    log("error", "Error al exportar citas", { error: err.message });
    res.status(500).json({ error: "Error al exportar citas." });
  }
});

app.get("/api/citas", requireAdmin, async (req, res) => {
  const { telefono } = req.query;

  if (!telefono) {
    return res.status(400).json({ error: "Se requiere el parametro telefono." });
  }

  if (!isValidPhone(telefono)) {
    return res.status(400).json({ error: "Formato de telefono invalido. Debe ser 3XXXXXXXXX (10 digitos)." });
  }

  try {
    const db = await getDB();
    const stmt = db.prepare("SELECT * FROM citas WHERE telefono = ? ORDER BY fecha, hora");
    stmt.bind([telefono]);

    const citas = [];
    while (stmt.step()) {
      citas.push(stmt.getAsObject());
    }
    stmt.free();

    auditLog("CONSULTAR_CITAS", { telefono, count: citas.length });
    res.json({ citas });
  } catch (err) {
    log("error", "Error al consultar citas", { error: err.message });
    res.status(500).json({ error: "Error al consultar citas." });
  }
});

app.delete("/api/citas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { telefono } = req.query;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "ID de cita invalido." });
  }

  try {
    await withWriteLock(async () => {
    const db = await getDB();

    let cita;
    if (telefono) {
      const check = db.prepare("SELECT id, nombre, fecha, hora, servicio FROM citas WHERE id = ? AND telefono = ?");
      check.bind([id, telefono]);
      const existe = check.step();
      cita = existe ? check.getAsObject() : null;
      check.free();
    } else {
      const check = db.prepare("SELECT id, nombre, fecha, hora, servicio FROM citas WHERE id = ?");
      check.bind([id]);
      const existe = check.step();
      cita = existe ? check.getAsObject() : null;
      check.free();
    }

    if (!cita) {
      const msgs = telefono
        ? "Cita no encontrada para ese telefono."
        : "Cita no encontrada.";
      return res.status(404).json({ error: msgs });
    }

    db.run("DELETE FROM citas WHERE id = ?", [id]);
    saveDB();

    auditLog("CANCELAR_CITA", { id, telefono: telefono || "admin", cita: cita.fecha });
    return res.json({ exito: true, mensaje: `Cita del ${cita.fecha} a las ${cita.hora} cancelada.` });
    });
  } catch (err) {
    log("error", "Error al cancelar cita", { error: err.message });
    res.status(500).json({ error: "Error al cancelar cita." });
  }
});

app.post("/api/chat", async (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ reply: "Por favor escribe un mensaje." });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      reply: `El mensaje no puede tener más de ${MAX_MESSAGE_LENGTH} caracteres.`,
    });
  }

  const safeMessage = sanitize(message);
  const allowedRoles = new Set(["user", "assistant"]);

  if (history != null && !Array.isArray(history)) {
    return res.status(400).json({ reply: "El historial debe ser un arreglo." });
  }

  if (history && history.length > MAX_HISTORY_LENGTH) {
    return res.status(400).json({
      reply: "La conversación es demasiado larga. Por favor inicia una nueva.",
    });
  }

  const safeHistory = (history || [])
    .filter((m) => m && allowedRoles.has(m.role))
    .map((m) => ({
      role: m.role,
      content: sanitize(m.content || ""),
    }));

  log("info", "Chat request", { length: safeMessage.length });

  if (!runningDirectly) {
    return res.json({ reply: "[Test mode] Chat endpoint funciona correctamente." });
  }

  try {
    await getDB();
  } catch (err) {
    log("error", "Error initializing DB", { error: err.message });
    return res.status(500).json({ reply: "Error al inicializar la base de datos." });
  }

  const messagesForGroq = [
    { role: "system", content: systemPrompt },
    ...safeHistory,
    { role: "user", content: safeMessage },
  ];

  async function callGroqWithRetry(msgs) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: msgs,
          tools: toolSchemas,
          tool_choice: "auto",
          temperature: 0,
          max_tokens: 800,
        });
      } catch (err) {
        if (isRateLimitError(err) && attempt < MAX_RETRIES) {
          if (isDailyQuotaError(err)) {
            throw err;
          }
          log("warn", "Rate limit hit, retrying", { attempt: attempt + 1, maxRetries: MAX_RETRIES + 1 });
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
  }

  try {
    const MAX_ITERATIONS = 5;
    let iteration = 0;

    let response = await callGroqWithRetry(messagesForGroq);

    while (
      response.choices[0].message.tool_calls &&
      iteration < MAX_ITERATIONS
    ) {
      iteration++;
      messagesForGroq.push(response.choices[0].message);

      for (const toolCall of response.choices[0].message.tool_calls) {
        const functionName = toolCall.function.name;
        const functionToCall = availableFunctions[functionName];

        if (!functionToCall) {
          messagesForGroq.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: functionName,
            content: JSON.stringify({ error: `Funcion "${functionName}" no encontrada.` }),
          });
          continue;
        }

        let functionArgs;
        try {
          functionArgs = JSON.parse(toolCall.function.arguments);
        } catch (parseErr) {
          messagesForGroq.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: functionName,
            content: JSON.stringify({ error: "Error al parsear argumentos de la herramienta." }),
          });
          continue;
        }

        let functionResponse;
        try {
          functionResponse = await functionToCall(functionArgs);
        } catch (fnErr) {
          functionResponse = JSON.stringify({ error: fnErr.message });
        }

        messagesForGroq.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: functionName,
          content: functionResponse,
        });
      }

      response = await callGroqWithRetry(messagesForGroq);
    }

    const reply =
      response.choices[0]?.message?.content ||
      "No pude generar una respuesta.";
    res.json({ reply });
  } catch (error) {
    log("error", "Error calling Groq API", { error: error.message });

    if (isRateLimitError(error)) {
      if (isDailyQuotaError(error)) {
        return res.status(429).json({
          reply: "Se agotó la cuota diaria de mensajes. Por favor intenta mañana o escríbenos al WhatsApp.",
        });
      }
      return res.status(429).json({
        reply: "Estamos recibiendo muchas solicitudes. Por favor espera un momento e intenta de nuevo.",
      });
    }

    res.status(500).json({ reply: "Lo siento, hubo un error. Intenta de nuevo." });
  }
});

if (runningDirectly) {
  app.listen(PORT, async () => {
    log("log", `Servidor iniciado en http://localhost:${PORT}`);

    if (REMINDER_INTERVAL_MINUTES > 0) {
      const runReminders = async () => {
        try {
          const db = await getDB();
          await correrRecordatorios(db);
        } catch (err) {
          log("error", "Error en job de recordatorios", { error: err.message });
        }
      };

      await runReminders();
      setInterval(runReminders, REMINDER_INTERVAL_MINUTES * 60 * 1000);
      log("log", `Job de recordatorios activado (cada ${REMINDER_INTERVAL_MINUTES} min)`);
    } else {
      log("log", "Job de recordatorios desactivado (REMINDER_INTERVAL_MINUTES=0)");
    }
  });
}

module.exports = app;
module.exports.csvEscape = csvEscape;

require("dotenv").config();

if (!process.env.GROQ_API_KEY) {
  console.error("ERROR: GROQ_API_KEY no está configurada.");
  console.error("Crea un archivo .env en la raíz del proyecto con:");
  console.error('  GROQ_API_KEY=tu-api-key-de-groq');
  console.error("O configúrala como variable de entorno del sistema.");
  process.exit(1);
}

const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");
const rateLimit = require("express-rate-limit");
const { systemPrompt } = require("./faq-context");
const { toolSchemas, availableFunctions } = require("./tools");
const { getDB, saveDB } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_HISTORY_LENGTH = 50;

function log(level, msg, data) {
  const ts = new Date().toISOString();
  const extra = data ? ` ${JSON.stringify(data)}` : "";
  console[level](`[${ts}] ${msg}${extra}`);
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

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/api", apiLimiter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/citas", async (req, res) => {
  const { telefono } = req.query;
  if (!telefono) {
    return res.status(400).json({ error: "Se requiere el parametro telefono." });
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

    res.json({ citas });
  } catch (err) {
    log("error", "Error al consultar citas", { error: err.message });
    res.status(500).json({ error: "Error al consultar citas." });
  }
});

app.delete("/api/citas/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const db = await getDB();

    const check = db.prepare("SELECT id FROM citas WHERE id = ?");
    check.bind([id]);
    const existe = check.step();
    check.free();

    if (!existe) {
      return res.status(404).json({ error: "Cita no encontrada." });
    }

    db.run("DELETE FROM citas WHERE id = ?", [id]);
    saveDB();

    res.json({ exito: true, mensaje: `Cita ${id} cancelada exitosamente.` });
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

  if (Array.isArray(history) && history.length > MAX_HISTORY_LENGTH) {
    return res.status(400).json({
      reply: "La conversación es demasiado larga. Por favor inicia una nueva.",
    });
  }

  log("log", "Chat request", { length: message.length });

  try {
    await getDB();
  } catch (err) {
    log("error", "Error initializing DB", { error: err.message });
    return res.status(500).json({ reply: "Error al inicializar la base de datos." });
  }

  const messagesForGroq = [
    { role: "system", content: systemPrompt },
    ...(history || []),
    { role: "user", content: message },
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

app.listen(PORT, () => {
  log("log", `Servidor iniciado en http://localhost:${PORT}`);
});

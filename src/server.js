require("dotenv").config();
const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");
const { systemPrompt } = require("./faq-context");
const { toolSchemas, availableFunctions } = require("./tools");
const { getDB } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000;

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

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/api/chat", async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ reply: "Por favor escribe un mensaje." });
  }

  try {
    await getDB();
  } catch (err) {
    console.error("Error initializing DB:", err);
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
          console.warn(`Rate limit hit (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${RETRY_DELAY_MS}ms...`);
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
          if (functionName === "consultar_disponibilidad") {
            functionResponse = await functionToCall(functionArgs.fecha);
          } else if (functionName === "reservar_cita") {
            functionResponse = await functionToCall(functionArgs);
          } else {
            functionResponse = JSON.stringify({ error: `Funcion "${functionName}" no implementada.` });
          }
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
    console.error("Error calling Groq API:", error);

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
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

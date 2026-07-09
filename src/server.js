require("dotenv").config();
const express = require("express");
const path = require("path");
const Groq = require("groq-sdk");
const { systemPrompt } = require("./faq-context");

const app = express();
const PORT = process.env.PORT || 3000;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ reply: "Por favor escribe un mensaje." });
  }

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_tokens: 500,
    });

    const reply = response.choices[0]?.message?.content || "No pude generar una respuesta.";
    res.json({ reply });
  } catch (error) {
    console.error("Error calling Groq API:", error);
    res.status(500).json({ reply: "Lo siento, hubo un error. Intenta de nuevo." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

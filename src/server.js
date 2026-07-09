require("dotenv").config();
const express = require("express");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk").default;
const { systemPrompt } = require("./faq-context");

const app = express();
const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ reply: "Por favor escribe un mensaje." });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    });

    const reply = response.content[0].text;
    res.json({ reply });
  } catch (error) {
    console.error("Error calling Claude API:", error);
    res.status(500).json({ reply: "Lo siento, hubo un error. Intenta de nuevo." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

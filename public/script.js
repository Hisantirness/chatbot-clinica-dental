const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");

let conversationHistory = [];

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user");
  input.value = "";

  conversationHistory.push({ role: "user", content: text });

  const button = form.querySelector("button");
  button.disabled = true;

  showTypingIndicator();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: conversationHistory }),
    });

    const data = await res.json();
    removeTypingIndicator();
    addMessage(data.reply, "bot");
    conversationHistory.push({ role: "assistant", content: data.reply });
  } catch {
    removeTypingIndicator();
    addMessage("Lo siento, hubo un error de conexión. Intenta de nuevo.", "bot");
  } finally {
    button.disabled = false;
    input.focus();
  }
});

function showTypingIndicator() {
  const div = document.createElement("div");
  div.className = "message bot typing";
  div.id = "typing-indicator";
  div.innerHTML = `<p><span class="dot"></span><span class="dot"></span><span class="dot"></span></p>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById("typing-indicator");
  if (el) el.remove();
}

function addMessage(text, sender) {
  const div = document.createElement("div");
  div.className = `message ${sender}`;
  div.innerHTML = `<p>${text}</p>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

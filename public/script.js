const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user");
  input.value = "";

  const button = form.querySelector("button");
  button.disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    const data = await res.json();
    addMessage(data.reply, "bot");
  } catch {
    addMessage("Lo siento, hubo un error de conexión. Intenta de nuevo.", "bot");
  } finally {
    button.disabled = false;
    input.focus();
  }
});

function addMessage(text, sender) {
  const div = document.createElement("div");
  div.className = `message ${sender}`;
  div.innerHTML = `<p>${text}</p>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

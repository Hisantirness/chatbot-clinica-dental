const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");
const sendBtn = document.getElementById("send-button");

let conversationHistory = [];

function getTimestamp() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function addMessage(text, sender, extraClass = "") {
  const div = document.createElement("div");
  div.className = `message ${sender} ${extraClass}`.trim();

  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = `<p>${escapeHtml(text)}</p>`;
  div.appendChild(content);

  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = getTimestamp();
  div.appendChild(time);

  messages.appendChild(div);
  scrollToBottom();
  return div;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
}

function showTypingIndicator() {
  const div = document.createElement("div");
  div.className = "typing-indicator";
  div.id = "typing-indicator";
  div.innerHTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;
  messages.appendChild(div);
  scrollToBottom();
}

function removeTypingIndicator() {
  const el = document.getElementById("typing-indicator");
  if (el) el.remove();
}

function showError(title, detail, showRetry = false) {
  removeTypingIndicator();
  const div = document.createElement("div");
  div.className = "message bot warning";

  const content = document.createElement("div");
  content.className = "message-content";

  let html = `<p><strong>${escapeHtml(title)}</strong></p>`;
  if (detail) html += `<p class="detail-text">${escapeHtml(detail)}</p>`;

  if (showRetry) {
    html += `<button class="retry-btn" data-retry="1">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      Reintentar
    </button>`;
  }

  content.innerHTML = html;
  div.appendChild(content);

  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = getTimestamp();
  div.appendChild(time);

  messages.appendChild(div);
  scrollToBottom();
}

let lastFailedMessage = "";

async function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  addMessage(trimmed, "user");

  conversationHistory.push({ role: "user", content: trimmed });

  sendBtn.disabled = true;
  input.disabled = true;
  showTypingIndicator();

  lastFailedMessage = trimmed;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: trimmed, history: conversationHistory }),
    });

    removeTypingIndicator();

    if (res.status === 429) {
      const data = await res.json();
      showError(
        "Muchas solicitudes",
        data.reply || "Espera un momento e intenta de nuevo.",
        true
      );
      return;
    }

    if (res.status === 400) {
      const data = await res.json();
      showError("Mensaje inválido", data.reply || "Verifica tu mensaje e intenta de nuevo.");
      return;
    }

    if (!res.ok) {
      showError("Error del servidor", "Hubo un problema. Intenta de nuevo.", true);
      return;
    }

    const data = await res.json();
    addMessage(data.reply, "bot");
    conversationHistory.push({ role: "assistant", content: data.reply });
  } catch {
    removeTypingIndicator();
    showError("Error de conexión", "No se pudo conectar con el servidor. Revisa tu internet.", true);
  } finally {
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

function retryLastMessage() {
  const errorMessages = messages.querySelectorAll(".message.warning, .message.error");
  errorMessages.forEach(el => el.remove());
  if (lastFailedMessage) {
    sendMessage(lastFailedMessage);
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(input.value);
  input.value = "";
});

messages.addEventListener("click", (e) => {
  const btn = e.target.closest(".retry-btn");
  if (btn) retryLastMessage();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.dispatchEvent(new Event("submit"));
  }
});

document.querySelectorAll("[data-localize]").forEach((el) => {
  el.textContent = getTimestamp();
});

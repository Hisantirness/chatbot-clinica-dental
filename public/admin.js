let token = localStorage.getItem("admin_token");

function showToast(msg, type) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove("show"), 3000);
}

function login() {
  token = document.getElementById("tokenInput").value.trim();
  if (!token) return showToast("Ingresa un token", "error");
  localStorage.setItem("admin_token", token);
  loadCitas();
}

function logout() {
  token = null;
  localStorage.removeItem("admin_token");
  document.getElementById("loginBox").classList.remove("hidden");
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("exportBtn").classList.add("hidden");
  document.getElementById("logoutBtn").classList.add("hidden");
}

async function apiFetch(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) { logout(); showToast("Token invalido", "error"); return null; }
  if (!res.ok) { showToast("Error del servidor", "error"); return null; }
  return res.json();
}

async function loadCitas() {
  const data = await apiFetch("/api/admin/citas");
  if (!data) return;

  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  document.getElementById("exportBtn").classList.remove("hidden");
  document.getElementById("logoutBtn").classList.remove("hidden");

  const citas = data.citas;
  document.getElementById("totalCitas").textContent = citas.length;

  const hoy = new Date().toISOString().slice(0, 10);
  const proximas = citas.filter(c => c.fecha >= hoy);
  const hoyCount = citas.filter(c => c.fecha === hoy).length;
  document.getElementById("proximasCitas").textContent = proximas.length;
  document.getElementById("hoyCitas").textContent = hoyCount;

  const tbody = document.getElementById("citasBody");
  const empty = document.getElementById("emptyState");

  if (citas.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  tbody.innerHTML = citas.map(c => `
    <tr>
      <td>${c.id}</td>
      <td><strong>${esc(c.nombre)}</strong></td>
      <td>${esc(c.cedula)}</td>
      <td>${esc(c.telefono)}</td>
      <td>${esc(c.email || "")}</td>
      <td>${esc(c.servicio)}</td>
      <td>${esc(c.dentista || "")}</td>
      <td>${esc(c.fecha)}</td>
      <td>${esc(c.hora)}</td>
      <td><button class="btn btn-danger btn-sm cancelar-btn" data-id="${c.id}">Cancelar</button></td>
    </tr>
  `).join("");
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function cancelarCita(id) {
  if (!confirm(`Cancelar cita #${id}?`)) return;
  const res = await fetch(`/api/citas/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.exito) { showToast(data.mensaje, "success"); loadCitas(); }
  else { showToast(data.error, "error"); }
}

async function exportCSV() {
  const res = await fetch(`/api/admin/citas/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { showToast("Error al exportar", "error"); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "citas-sonrisa-sana.csv";
  a.click();
  URL.revokeObjectURL(url);
  showToast("CSV exportado", "success");
}

document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("loginBtn").addEventListener("click", login);
  document.getElementById("tokenInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") login();
  });
  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.getElementById("citasBody").addEventListener("click", function (e) {
    const btn = e.target.closest(".cancelar-btn");
    if (btn) cancelarCita(Number(btn.dataset.id));
  });

  if (token) {
    document.getElementById("tokenInput").value = token;
    loadCitas();
  }
});

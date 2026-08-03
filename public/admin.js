let token = localStorage.getItem("admin_token");
let sedes = [];

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
  loadDashboard();
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

async function apiFetchJson(url, options) {
  const res = await fetch(url, {
    method: options?.method || "GET",
    headers: { Authorization: `Bearer ${token}`, ...(options?.body ? { "Content-Type": "application/json" } : {}) },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) { logout(); showToast("Token invalido", "error"); return null; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { showToast(data.error || "Error del servidor", "error"); return null; }
  return data;
}

function badgeConfirmado(c) {
  if (c.confirmado == null || c.confirmado === 0) return '<span class="badge badge-gray">Sin confirmar</span>';
  if (c.confirmado === 1) return '<span class="badge badge-green">Confirmado</span>';
  if (c.confirmado === 2) return '<span class="badge badge-red">Cancelado</span>';
  return "";
}

function badgeRecordatorio(c) {
  if (c.recordatorio_enviado === 1) return '<span class="badge badge-green">Enviado</span>';
  if (c.email) return '<span class="badge badge-yellow">Pendiente</span>';
  return '<span class="badge badge-gray">Sin email</span>';
}

async function loadDashboard() {
  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  document.getElementById("exportBtn").classList.remove("hidden");
  document.getElementById("logoutBtn").classList.remove("hidden");

  await Promise.all([loadCitas(), loadRecordatorios()]);
}

async function loadCitas() {
  const data = await apiFetch("/api/admin/citas");
  if (!data) return;

  const citas = data.citas;
  if (Array.isArray(data.sedes)) {
    sedes = data.sedes;
    const select = document.getElementById("sedeFilter");
    const prev = select.value;
    select.innerHTML = '<option value="">Todas las sedes</option>' + sedes.map(s => `<option value="${esc(s.nombre)}">${esc(s.nombre)}</option>`).join("");
    if (prev) select.value = prev;
  }

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
      <td>${esc(c.sede || "")}</td>
      <td>${esc(c.dentista || "")}</td>
      <td>${esc(c.fecha)}</td>
      <td>${esc(c.hora)}</td>
      <td>${badgeConfirmado(c)}</td>
      <td><button class="btn btn-danger btn-sm cancelar-btn" data-id="${c.id}">Cancelar</button></td>
    </tr>
  `).join("");
}

async function loadRecordatorios() {
  const data = await apiFetch("/api/admin/recordatorios");
  if (!data) return;

  const { resumen, proximas, enviadas } = data;
  document.getElementById("remConEmail").textContent = resumen.conEmail;
  document.getElementById("remPendientes").textContent = resumen.pendientes;
  document.getElementById("remEnviados").textContent = resumen.enviados;
  document.getElementById("remConfirmados").textContent = resumen.confirmados;

  const filter = document.getElementById("sedeFilter").value;
  const filas = [...proximas.map(c => ({ ...c, _tipo: "pendiente" })), ...enviadas.map(c => ({ ...c, _tipo: "enviado" }))]
    .filter(c => !filter || c.sede === filter)
    .slice(0, 100);

  const tbody = document.getElementById("remindersBody");
  const empty = document.getElementById("remindersEmpty");

  if (filas.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  tbody.innerHTML = filas.map(c => `
    <tr>
      <td>${c.id}</td>
      <td><strong>${esc(c.nombre)}</strong></td>
      <td>${esc(c.email || "")}</td>
      <td>${esc(c.servicio)}</td>
      <td>${esc(c.sede || "")}</td>
      <td>${esc(c.fecha)}</td>
      <td>${esc(c.hora)}</td>
      <td>${c._tipo === "enviado" ? '<span class="badge badge-green">Enviado</span>' : badgeRecordatorio(c)}</td>
      <td>${badgeConfirmado(c)}</td>
      <td>${c._tipo === "pendiente" && c.email ? `<button class="btn btn-success btn-sm enviar-ahora-btn" data-id="${c.id}">Enviar ahora</button>` : ""}</td>
    </tr>
  `).join("");
}

async function enviarAhora(id) {
  const data = await apiFetchJson(`/api/admin/recordatorios/${id}/enviar`, { method: "POST" });
  if (data?.exito) {
    showToast(data.mensaje, "success");
    await loadRecordatorios();
  }
}

async function enviarPrueba() {
  const email = prompt("Email de destino para la prueba:", "");
  if (!email) return;
  const data = await apiFetchJson("/api/admin/recordatorios/prueba", { method: "POST", body: { email: email.trim() } });
  if (data?.exito) showToast(data.mensaje, "success");
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
  if (data.exito) { showToast(data.mensaje, "success"); loadDashboard(); }
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
  document.getElementById("testEmailBtn").addEventListener("click", enviarPrueba);
  document.getElementById("sedeFilter").addEventListener("change", loadRecordatorios);
  document.getElementById("citasBody").addEventListener("click", function (e) {
    const btn = e.target.closest(".cancelar-btn");
    if (btn) cancelarCita(Number(btn.dataset.id));
  });
  document.getElementById("remindersBody").addEventListener("click", function (e) {
    const btn = e.target.closest(".enviar-ahora-btn");
    if (btn) enviarAhora(Number(btn.dataset.id));
  });

  if (token) {
    document.getElementById("tokenInput").value = token;
    loadDashboard();
  }
});

import { describe, it, expect } from "vitest";

const BASE = process.env.RAILWAY_URL || "https://chatbot-clinica-dental-production.up.railway.app";

describe("Health endpoint", () => {
  it("GET /health responde con status ok", async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});

describe("API endpoints", () => {
  it("GET /api/citas sin telefono da error 400", async () => {
    const res = await fetch(`${BASE}/api/citas`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("telefono");
  });

  it("POST /api/chat responde con reply", async () => {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hola", history: [] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBeDefined();
    expect(typeof body.reply).toBe("string");
    expect(body.reply.length).toBeGreaterThan(0);
  }, 30000);

  it("POST /api/chat rechaza mensaje vacio", async () => {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "", history: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/chat rechaza mensaje muy largo", async () => {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(501), history: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reply).toContain("500");
  });

  it("POST /api/chat consulta disponibilidad", async () => {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "¿Qué horarios tienen el lunes?", history: [] }),
    });
    expect([200, 429]).toContain(res.status);
    const body = await res.json();
    expect(body.reply).toBeDefined();
  }, 30000);
});

describe("Frontend", () => {
  it("GET / sirve el index.html", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Sonrisa Sana");
  });
});

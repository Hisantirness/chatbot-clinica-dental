import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

let app;

beforeAll(async () => {
  app = (await import("../src/server.js")).default;
});

describe("GET /health", () => {
  it("responde con status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.timestamp).toBeDefined();
  });
});

describe("GET /", () => {
  it("sirve el index.html", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("Sonrisa Sana");
  });
});

describe("GET /api/citas", () => {
  it("rechaza sin telefono", async () => {
    const res = await request(app).get("/api/citas");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("telefono");
  });
});

describe("DELETE /api/citas/:id", () => {
  it("rechaza cita inexistente", async () => {
    const res = await request(app).delete("/api/citas/99999");
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("no encontrada");
  });
});

describe("POST /api/chat", () => {
  it("rechaza mensaje vacio", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "", history: [] });
    expect(res.status).toBe(400);
  });

  it("rechaza mensaje muy largo", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "x".repeat(501), history: [] });
    expect(res.status).toBe(400);
    expect(res.body.reply).toContain("500");
  });

  it("rechaza body sin message", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ history: [] });
    expect(res.status).toBe(400);
  });

  it("rechaza history demasiado largo", async () => {
    const history = Array.from({ length: 51 }, (_, i) => ({
      role: "user",
      content: `msg ${i}`,
    }));
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "hola", history });
    expect(res.status).toBe(400);
    expect(res.body.reply).toContain("larga");
  });

  it("acepta mensaje valido en modo test", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "Hola", history: [] });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBeDefined();
  });
});

describe("CORS headers", () => {
  it("incluye Access-Control-Allow-Origin", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://example.com");
    expect(res.headers["access-control-allow-origin"]).toBe("https://example.com");
  });
});

describe("Security headers (helmet)", () => {
  it("incluye X-Content-Type-Options", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("incluye X-Frame-Options", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });
});

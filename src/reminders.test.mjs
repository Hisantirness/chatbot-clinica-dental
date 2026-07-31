import { describe, it, expect, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const creados = [];

function nuevoDbPath() {
  const p = path.join(os.tmpdir(), `clinica-reminders-${process.pid}-${Date.now()}-${creados.length}.db`);
  creados.push(p);
  return p;
}

async function importar(conSMTP) {
  const dbPath = nuevoDbPath();
  vi.stubEnv("DB_PATH", dbPath);
  if (conSMTP) {
    vi.stubEnv("SMTP_HOST", "smtp.test.com");
    vi.stubEnv("SMTP_USER", "usuario@test.com");
    vi.stubEnv("SMTP_PASS", "clave-secreta");
    vi.stubEnv("EMAIL_FROM", "Clinica Sonrisa Sana <no-responder@sonrisasana.com>");
  } else {
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    vi.stubEnv("EMAIL_FROM", "");
  }
  vi.resetModules();
  const reminders = await import("./reminders.js");
  const dbMod = await import("./db.js");
  const db = await dbMod.getDB();
  return { reminders, db, dbMod, dbPath };
}

async function insertarCita(db, dbMod, overrides = {}) {
  const cita = {
    nombre: "Paciente Test",
    cedula: "123456789",
    telefono: "3001234567",
    servicio: "limpieza",
    fecha: "2026-08-10",
    hora: "14:00",
    email: "paciente@test.com",
    recordatorio_enviado: 0,
    ...overrides,
  };
  db.run(
    "INSERT INTO citas (nombre, cedula, telefono, servicio, fecha, hora, email, recordatorio_enviado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [cita.nombre, cita.cedula, cita.telefono, cita.servicio, cita.fecha, cita.hora, cita.email, cita.recordatorio_enviado]
  );
  const idResult = db.exec("SELECT last_insert_rowid()");
  dbMod.saveDB();
  return idResult[0].values[0][0];
}

afterAll(() => {
  for (const p of creados) fs.rmSync(p, { force: true });
  vi.unstubAllEnvs();
});

describe("bogotaToUtc", () => {
  it("convierte hora de Bogota (UTC-5) a UTC", async () => {
    const { reminders } = await importar(true);
    expect(reminders.bogotaToUtc("2026-08-10", "14:00")).toBe(Date.UTC(2026, 7, 10, 19, 0, 0));
  });
});

describe("generarContenidoEmail", () => {
  it("incluye datos de la cita en el asunto y cuerpo", async () => {
    const { reminders } = await importar(true);
    const contenido = reminders.generarContenidoEmail({
      nombre: "Juan Perez",
      servicio: "ortodoncia",
      fecha: "2026-08-10",
      hora: "14:00",
      dentista: "Dra. Lopez",
    });
    expect(contenido.subject).toContain("Recordatorio");
    expect(contenido.subject).toContain("14:00");
    expect(contenido.text).toContain("Juan Perez");
    expect(contenido.text).toContain("ortodoncia");
    expect(contenido.text).toContain("Dra. Lopez");
  });

  it("no menciona dentista si no hay", async () => {
    const { reminders } = await importar(true);
    const contenido = reminders.generarContenidoEmail({
      nombre: "Ana",
      servicio: "limpieza",
      fecha: "2026-08-10",
      hora: "10:00",
    });
    expect(contenido.text).not.toContain("Dentista:");
  });
});

describe("correrRecordatorios - sin SMTP", () => {
  it("omite el envio y no falla cuando SMTP no esta configurado", async () => {
    const { reminders, db, dbMod } = await importar(false);
    await insertarCita(db, dbMod, { fecha: "2099-01-05", hora: "10:00" });

    const logSpy = vi.fn();
    const result = await reminders.correrRecordatorios(db, {
      now: new Date(reminders.bogotaToUtc("2099-01-05", "10:00") - 24 * 3600 * 1000),
      log: logSpy,
    });

    expect(result).toEqual({ enviados: 0, omitidos: 0, configurado: false });
    expect(logSpy).toHaveBeenCalled();
  });
});

describe("correrRecordatorios - ventana de 24h", () => {
  it("no envia antes de que se cumplan las 24h de antelacion", async () => {
    const { reminders, db, dbMod } = await importar(true);
    const id = await insertarCita(db, dbMod, { fecha: "2099-02-10", hora: "14:00" });

    const send = vi.fn(async () => true);
    const antes = new Date(reminders.bogotaToUtc("2099-02-10", "14:00") - 25 * 3600 * 1000);
    const result = await reminders.correrRecordatorios(db, { now: antes, send });

    expect(send).not.toHaveBeenCalled();
    expect(result.enviados).toBe(0);
    expect(db.exec("SELECT recordatorio_enviado FROM citas WHERE id = ?", [id])[0].values[0][0]).toBe(0);
  });

  it("envia exactamente a las 24h de antelacion", async () => {
    const { reminders, db, dbMod } = await importar(true);
    const id = await insertarCita(db, dbMod, { fecha: "2099-02-11", hora: "14:00" });

    const send = vi.fn(async () => true);
    const result = await reminders.correrRecordatorios(db, {
      now: new Date(reminders.bogotaToUtc("2099-02-11", "14:00") - 24 * 3600 * 1000),
      send,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.enviados).toBe(1);
    expect(send.mock.calls[0][0].id).toBe(id);
    expect(send.mock.calls[0][0].email).toBe("paciente@test.com");
    expect(db.exec("SELECT recordatorio_enviado FROM citas WHERE id = ?", [id])[0].values[0][0]).toBe(1);
  });

  it("no envia despues de la hora de la cita", async () => {
    const { reminders, db, dbMod } = await importar(true);
    await insertarCita(db, dbMod, { fecha: "2099-02-12", hora: "14:00" });

    const send = vi.fn(async () => true);
    const despues = new Date(reminders.bogotaToUtc("2099-02-12", "14:00") + 60 * 1000);
    const result = await reminders.correrRecordatorios(db, { now: despues, send });

    expect(send).not.toHaveBeenCalled();
    expect(result.enviados).toBe(0);
  });

  it("no reenvia una cita ya recordada", async () => {
    const { reminders, db, dbMod } = await importar(true);
    await insertarCita(db, dbMod, { fecha: "2099-02-13", hora: "14:00", recordatorio_enviado: 1 });

    const send = vi.fn(async () => true);
    const result = await reminders.correrRecordatorios(db, {
      now: new Date(reminders.bogotaToUtc("2099-02-13", "14:00") - 24 * 3600 * 1000),
      send,
    });

    expect(send).not.toHaveBeenCalled();
    expect(result.enviados).toBe(0);
  });

  it("ignora citas sin email", async () => {
    const { reminders, db, dbMod } = await importar(true);
    await insertarCita(db, dbMod, { fecha: "2099-02-14", hora: "14:00", email: null });

    const send = vi.fn(async () => true);
    const result = await reminders.correrRecordatorios(db, {
      now: new Date(reminders.bogotaToUtc("2099-02-14", "14:00") - 24 * 3600 * 1000),
      send,
    });

    expect(send).not.toHaveBeenCalled();
    expect(result.enviados).toBe(0);
  });

  it("si el envio falla, no marca la cita como enviada", async () => {
    const { reminders, db, dbMod } = await importar(true);
    const id = await insertarCita(db, dbMod, { fecha: "2099-02-15", hora: "14:00" });

    const send = vi.fn(async () => {
      throw new Error("SMTP caido");
    });
    const logSpy = vi.fn();
    const result = await reminders.correrRecordatorios(db, {
      now: new Date(reminders.bogotaToUtc("2099-02-15", "14:00") - 24 * 3600 * 1000),
      send,
      log: logSpy,
    });

    expect(result.enviados).toBe(0);
    expect(logSpy).toHaveBeenCalled();
    expect(db.exec("SELECT recordatorio_enviado FROM citas WHERE id = ?", [id])[0].values[0][0]).toBe(0);
  });

  it("devuelve conteo de enviados y omitidos", async () => {
    const { reminders, db, dbMod } = await importar(true);
    await insertarCita(db, dbMod, { fecha: "2099-03-01", hora: "14:00" });
    await insertarCita(db, dbMod, { fecha: "2099-03-02", hora: "09:00" });

    const send = vi.fn(async () => true);
    const result = await reminders.correrRecordatorios(db, {
      now: new Date(reminders.bogotaToUtc("2099-03-01", "14:00") - 24 * 3600 * 1000),
      send,
    });

    expect(result.enviados).toBe(1);
    expect(result.omitidos).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let t;

beforeAll(async () => {
  const mod = await import("./tools.js");
  t = mod;
});

describe("generarFranjas", () => {
  it("genera franjas lunes a viernes de 8:00 a 17:00", () => {
    const franjas = t.generarFranjas("2026-07-30");
    expect(franjas[0]).toBe("08:00");
    expect(franjas[franjas.length - 1]).toBe("17:00");
  });

  it("genera franjas sabado de 8:00 a 11:45", () => {
    const franjas = t.generarFranjas("2026-08-01");
    expect(franjas.length).toBe(6);
    expect(franjas[0]).toBe("08:00");
    expect(franjas[franjas.length - 1]).toBe("11:45");
  });

  it("devuelve array vacio los domingos", () => {
    const franjas = t.generarFranjas("2026-08-02");
    expect(franjas).toEqual([]);
  });

  it("cada franja dura 45 minutos", () => {
    const franjas = t.generarFranjas("2026-07-30");
    for (let i = 0; i < franjas.length - 1; i++) {
      const [h1, m1] = franjas[i].split(":").map(Number);
      const [h2, m2] = franjas[i + 1].split(":").map(Number);
      expect(h2 * 60 + m2 - (h1 * 60 + m1)).toBe(45);
    }
  });

  it("tiene 13 franjas entre semana", () => {
    const franjas = t.generarFranjas("2026-07-30");
    expect(franjas.length).toBe(13);
  });
});

describe("normalizeFecha", () => {
  it("devuelve la misma fecha si es valida YYYY-MM-DD", () => {
    expect(t.normalizeFecha("2026-07-30")).toBe("2026-07-30");
  });

  it("devuelve fecha de hoy si recibe null", () => {
    expect(t.normalizeFecha(null)).toBe(t.normalizeFecha(undefined));
  });

  it("devuelve fecha de hoy si formato es invalido", () => {
    expect(t.normalizeFecha("30-07-2026")).toBe(t.normalizeFecha(null));
  });
});

describe("consultar_disponibilidad", () => {
  it("devuelve horarios_libres para fecha valida entre semana", async () => {
    const result = JSON.parse(await t.consultar_disponibilidad({ fecha: "2026-08-03" }));
    expect(result.fecha).toBe("2026-08-03");
    expect(result.horarios_libres.length).toBeGreaterThan(0);
  });

  it("devuelve mensaje para domingo", async () => {
    const result = JSON.parse(await t.consultar_disponibilidad({ fecha: "2026-08-02" }));
    expect(result.horarios_libres).toEqual([]);
    expect(result.mensaje).toContain("domingo");
  });

  it("devuelve horarios en formato HH:MM", async () => {
    const result = JSON.parse(await t.consultar_disponibilidad({ fecha: "2026-08-03" }));
    for (const h of result.horarios_libres) {
      expect(h).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});

describe("reservar_cita", () => {
  it("reserva una cita correctamente", async () => {
    const result = JSON.parse(
      await t.reservar_cita({
        nombre: "Test Paciente",
        cedula: "123456789",
        telefono: "3001234567",
        servicio: "limpieza",
        fecha: "2026-08-10",
        hora: "08:00",
      })
    );
    expect(result.exito).toBe(true);
    expect(result.cita_id).toBeDefined();
    expect(result.mensaje).toContain("Test Paciente");
  });

  it("rechaza telefono invalido", async () => {
    const result = JSON.parse(
      await t.reservar_cita({
        nombre: "Test",
        cedula: "111",
        telefono: "222",
        servicio: "resina",
        fecha: "2026-08-10",
        hora: "10:00",
      })
    );
    expect(result.exito).toBe(false);
    expect(result.error).toContain("telefono");
  });

  it("rechaza horario ocupado", async () => {
    const result = JSON.parse(
      await t.reservar_cita({
        nombre: "Otro Paciente",
        cedula: "987654321",
        telefono: "3007654321",
        servicio: "blanqueamiento",
        fecha: "2026-08-10",
        hora: "08:00",
      })
    );
    expect(result.exito).toBe(false);
    expect(result.error).toContain("ocupado");
  });

  it("rechaza horario invalido", async () => {
    const result = JSON.parse(
      await t.reservar_cita({
        nombre: "Test",
        cedula: "111",
        telefono: "3001112222",
        servicio: "resina",
        fecha: "2026-08-10",
        hora: "25:00",
      })
    );
    expect(result.exito).toBe(false);
    expect(result.error).toContain("no es valido");
  });

  it("rechaza domingo", async () => {
    const result = JSON.parse(
      await t.reservar_cita({
        nombre: "Test",
        cedula: "111",
        telefono: "3001112222",
        servicio: "valoracion",
        fecha: "2026-08-02",
        hora: "10:00",
      })
    );
    expect(result.exito).toBe(false);
  });
});

describe("consultar_mis_citas", () => {
  it("devuelve citas para un telefono con reservas", async () => {
    const result = JSON.parse(await t.consultar_mis_citas({ telefono: "3001234567" }));
    expect(result.citas).toBeInstanceOf(Array);
    expect(result.citas.length).toBeGreaterThan(0);
    expect(result.citas[0]).toHaveProperty("id");
    expect(result.citas[0]).toHaveProperty("servicio");
  });

  it("devuelve mensaje si no hay citas", async () => {
    const result = JSON.parse(await t.consultar_mis_citas({ telefono: "0000000000" }));
    expect(result.citas).toEqual([]);
    expect(result.mensaje).toContain("No tienes citas");
  });
});

describe("normalizeFecha - mas casos", () => {
  it("devuelve fecha de hoy si recibe string vacio", () => {
    expect(t.normalizeFecha("")).toBe(t.normalizeFecha(null));
  });

  it("devuelve fecha de hoy si recibe undefined", () => {
    const result = t.normalizeFecha(undefined);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("reservar_cita - casos borde", () => {
  it("reserva con caracteres especiales en nombre", async () => {
    const result = JSON.parse(
      await t.reservar_cita({
        nombre: "Maria Jose O'Brien",
        cedula: "ABC123",
        telefono: "3009999999",
        servicio: "ortodoncia",
        fecha: "2026-08-11",
        hora: "08:00",
      })
    );
    expect(result.exito).toBe(true);
    expect(result.cita_id).toBeDefined();
  });

  it("reserva todos los servicios disponibles", async () => {
    const servicios = ["limpieza", "blanqueamiento", "ortodoncia", "extraccion", "resina", "implante", "valoracion"];
    const horas = ["08:00", "08:45", "09:30", "10:15", "11:00", "11:45", "12:30"];
    for (let i = 0; i < servicios.length; i++) {
      const result = JSON.parse(
        await t.reservar_cita({
          nombre: "Test Servicios",
          cedula: "000" + i,
          telefono: "3008888" + String(i).padStart(3, "0"),
          servicio: servicios[i],
          fecha: "2026-08-17",
          hora: horas[i],
        })
      );
      expect(result.exito).toBe(true);
    }
  });
});

describe("consultar_mis_citas - mas casos", () => {
  it("devuelve citas exactas para telefono", async () => {
    const result = JSON.parse(await t.consultar_mis_citas({ telefono: "3009999999" }));
    expect(result.citas.length).toBe(1);
    expect(result.citas[0].servicio).toBe("ortodoncia");
  });
});

describe("cancelar_cita", () => {
  it("cancela una cita existente", async () => {
    const misCitas = JSON.parse(await t.consultar_mis_citas({ telefono: "3001234567" }));
    const citaId = misCitas.citas[0].id;

    const result = JSON.parse(await t.cancelar_cita({ cita_id: citaId, telefono: "3001234567" }));
    expect(result.exito).toBe(true);
    expect(result.mensaje).toContain("cancelada");
  });

  it("rechaza cancelar cita de otro telefono", async () => {
    const result = JSON.parse(await t.cancelar_cita({ cita_id: 999, telefono: "0000000000" }));
    expect(result.exito).toBe(false);
    expect(result.error).toContain("no encontrada");
  });
});

describe("concurrencia de reservas (write lock)", () => {
  it("solo una de dos reservas simultaneas al mismo slot tiene exito", async () => {
    const slot = "2026-11-09"; 
    const hora = "08:00";

    const [r1, r2] = await Promise.all([
      t.reservar_cita({
        nombre: "Concurrente Uno",
        cedula: "111111",
        telefono: "3111111111",
        servicio: "limpieza",
        fecha: slot,
        hora,
      }),
      t.reservar_cita({
        nombre: "Concurrente Dos",
        cedula: "222222",
        telefono: "3222222222",
        servicio: "valoracion",
        fecha: slot,
        hora,
      }),
    ]);

    const a = JSON.parse(r1);
    const b = JSON.parse(r2);

    expect(a.exito !== b.exito).toBe(true);
    const ganador = a.exito ? a : b;
    const perdedor = a.exito ? b : a;
    expect(ganador.exito).toBe(true);
    expect(perdedor.exito).toBe(false);
    expect(perdedor.error).toContain("ocupado");
  });
});

describe("primer arranque con base de datos vacia", () => {
  it("crea la tabla citas cuando el archivo no existe", async () => {
    const emptyDb = path.join(os.tmpdir(), `clinica-empty-${process.pid}-${Date.now()}.db`);
    fs.rmSync(emptyDb, { force: true });

    vi.stubEnv("DB_PATH", emptyDb);
    vi.resetModules();
    const { getDB } = await import("./db.js");
    const db = await getDB();

    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='citas'");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].values[0][0]).toBe("citas");

    db.close();
    fs.rmSync(emptyDb, { force: true });
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

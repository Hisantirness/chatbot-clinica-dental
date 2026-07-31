const { getDB, saveDB } = require("./db");

let writeLock = Promise.resolve();

function withWriteLock(fn) {
  const run = writeLock.then(fn, fn);
  writeLock = run.catch(() => {});
  return run;
}

function getFechaHoy() {
  const now = new Date();
  const colombia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return colombia;
}

function generarFranjas(fecha) {
  const dia = new Date(fecha + "T12:00:00").getDay();
  let inicio, fin;

  if (dia === 0) {
    return [];
  } else if (dia === 6) {
    inicio = 8;
    fin = 13;
  } else {
    inicio = 8;
    fin = 18;
  }

  const duracion = 45;
  const franjas = [];
  let totalMin = inicio * 60;
  const finMin = fin * 60;

  while (totalMin + duracion <= finMin) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    franjas.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    totalMin += duracion;
  }
  return franjas;
}

function normalizeFecha(fecha) {
  if (!fecha || typeof fecha !== "string") return getFechaHoy();
  const match = fecha.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return getFechaHoy();
  const d = new Date(fecha + "T12:00:00");
  if (isNaN(d.getTime())) return getFechaHoy();
  return fecha;
}

async function consultar_disponibilidad({ fecha } = {}) {
  try {
    fecha = normalizeFecha(fecha);
    const db = await getDB();
    const todasLasFranjas = generarFranjas(fecha);

    if (todasLasFranjas.length === 0) {
      return JSON.stringify({
        fecha,
        horarios_libres: [],
        mensaje: "La clinica no atiende los domingos.",
      });
    }

    const stmt = db.prepare(
      "SELECT hora FROM citas WHERE fecha = ? AND hora IN (" +
        todasLasFranjas.map(() => "?").join(",") +
        ")"
    );
    stmt.bind([fecha, ...todasLasFranjas]);

    const ocupadas = [];
    while (stmt.step()) {
      ocupadas.push(stmt.getAsObject().hora);
    }
    stmt.free();

    const libres = todasLasFranjas.filter((h) => !ocupadas.includes(h));

    return JSON.stringify({
      fecha,
      horarios_libres: libres,
      horarios_ocupados: ocupadas,
    });
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

async function reservar_cita({ nombre, cedula, telefono, servicio, fecha, hora, dentista }) {
  return withWriteLock(async () => {
  try {
    if (!/^3\d{9}$/.test(telefono)) {
      return JSON.stringify({
        exito: false,
        error: "El numero de telefono debe tener formato colombiano: 3XXXXXXXXX (10 digitos, ejemplo: 3001234567).",
      });
    }

    fecha = normalizeFecha(fecha);
    const db = await getDB();

    const todasLasFranjas = generarFranjas(fecha);
    if (!todasLasFranjas.includes(hora)) {
      return JSON.stringify({
        exito: false,
        error: `El horario ${hora} no es valido para ${fecha}. Horarios validos: ${todasLasFranjas.join(", ")}`,
      });
    }

    const check = db.prepare(
      "SELECT id FROM citas WHERE fecha = ? AND hora = ?"
    );
    check.bind([fecha, hora]);
    const ocupada = check.step();
    check.free();

    if (ocupada) {
      return JSON.stringify({
        exito: false,
        error: `El horario ${hora} del ${fecha} ya esta ocupado. Por favor elige otro horario.`,
      });
    }

    db.run(
      "INSERT INTO citas (nombre, cedula, telefono, servicio, fecha, hora, dentista) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [nombre, cedula, telefono, servicio, fecha, hora, dentista || null]
    );

    const idResult = db.exec("SELECT last_insert_rowid()");
    const id = idResult.length > 0 ? idResult[0].values[0][0] : null;

    saveDB();

    return JSON.stringify({
      exito: true,
      cita_id: id,
      mensaje: `Cita confirmada: ${nombre} el ${fecha} a las ${hora} para ${servicio}.`,
    });
  } catch (err) {
    return JSON.stringify({ exito: false, error: err.message });
  }
  });
}

async function consultar_mis_citas({ telefono }) {
  try {
    const db = await getDB();
    const stmt = db.prepare(
      "SELECT id, nombre, cedula, servicio, fecha, hora, dentista, creado_en FROM citas WHERE telefono = ? ORDER BY fecha, hora"
    );
    stmt.bind([telefono]);

    const citas = [];
    while (stmt.step()) {
      citas.push(stmt.getAsObject());
    }
    stmt.free();

    if (citas.length === 0) {
      return JSON.stringify({ citas: [], mensaje: "No tienes citas agendadas." });
    }

    return JSON.stringify({ citas });
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

async function cancelar_cita({ cita_id, telefono }) {
  return withWriteLock(async () => {
  try {
    const db = await getDB();

    const check = db.prepare("SELECT id, nombre, fecha, hora, servicio FROM citas WHERE id = ? AND telefono = ?");
    check.bind([cita_id, telefono]);
    const existe = check.step();
    const cita = existe ? check.getAsObject() : null;
    check.free();

    if (!cita) {
      return JSON.stringify({
        exito: false,
        error: "Cita no encontrada. Verifica el ID de la cita.",
      });
    }

    db.run("DELETE FROM citas WHERE id = ?", [cita_id]);
    saveDB();

    return JSON.stringify({
      exito: true,
      mensaje: `Cita del ${cita.fecha} a las ${cita.hora} para ${cita.servicio} cancelada exitosamente.`,
    });
  } catch (err) {
    return JSON.stringify({ exito: false, error: err.message });
  }
  });
}

const toolSchemas = [
  {
    type: "function",
    function: {
      name: "consultar_disponibilidad",
        description:
          "Consulta los horarios disponibles para una fecha especifica. Devuelve los slots libres de 45 minutos segun el horario de la clinica (lunes-viernes 8am-6pm, sabados 8am-1pm). Si el usuario no especifica fecha, puedes usar 'hoy' y el sistema usara la fecha real del servidor.",
      parameters: {
        type: "object",
        properties: {
          fecha: {
            type: "string",
            description:
              "Fecha a consultar en formato YYYY-MM-DD (ej: 2025-07-15)",
          },
        },
        required: ["fecha"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reservar_cita",
      description:
        "Reserva una cita real en la base de datos. SOLO llama esta funcion despues de haber recopilado TODOS los datos obligatorios del paciente (nombre completo, cedula, telefono, servicio, fecha y hora). Primero verifica que el horario siga libre antes de insertar.",
      parameters: {
        type: "object",
        properties: {
          nombre: {
            type: "string",
            description: "Nombre completo del paciente",
          },
          cedula: {
            type: "string",
            description: "Numero de cedula o documento de identidad",
          },
          telefono: {
            type: "string",
            description: "Numero de telefono del paciente",
          },
          servicio: {
            type: "string",
            description:
              "Servicio dental a agendar (limpieza, blanqueamiento, ortodoncia, extraccion (incluye cordales/muelas del juicio), resina, implante, valoracion)",
          },
          fecha: {
            type: "string",
            description: "Fecha de la cita en formato YYYY-MM-DD",
          },
          hora: {
            type: "string",
            description:
              "Hora de la cita en formato HH:MM (debe ser un horario valido de 45 min)",
          },
          dentista: {
            type: "string",
            description:
              "Nombre del dentista preferido (opcional). Si el paciente no lo menciona, omitelo.",
          },
        },
        required: ["nombre", "cedula", "telefono", "servicio", "fecha", "hora"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_mis_citas",
      description:
        "Consulta todas las citas agendadas de un paciente usando su numero de telefono. Devuelve la lista de citas con ID, fecha, hora, servicio y estado. El paciente debe proporcionar su numero de telefono.",
      parameters: {
        type: "object",
        properties: {
          telefono: {
            type: "string",
            description: "Numero de telefono del paciente para buscar sus citas",
          },
        },
        required: ["telefono"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancelar_cita",
      description:
        "Cancela una cita existente. Requiere el ID de la cita y el numero de telefono del paciente como confirmacion. La cita debe pertenecer al paciente. No se puede cancelar una cita que no existe o que no pertenece al telefono proporcionado.",
      parameters: {
        type: "object",
        properties: {
          cita_id: {
            type: "number",
            description: "ID numerico de la cita a cancelar",
          },
          telefono: {
            type: "string",
            description: "Numero de telefono del paciente para verificar que la cita le pertenece",
          },
        },
        required: ["cita_id", "telefono"],
      },
    },
  },
];

const availableFunctions = {
  consultar_disponibilidad,
  reservar_cita,
  consultar_mis_citas,
  cancelar_cita,
};

module.exports = {
  toolSchemas,
  availableFunctions,
  withWriteLock,
  generarFranjas,
  normalizeFecha,
  consultar_disponibilidad,
  reservar_cita,
  consultar_mis_citas,
  cancelar_cita,
};

const DEFAULT_SEDES = "Sede Norte|Avenida 6 Norte, Cali";

function parseSedes(raw) {
  const source = (raw != null && String(raw).trim()) || process.env.SEDES || DEFAULT_SEDES;
  return String(source)
    .split(";")
    .map((entry) => {
      const [nombre, ...rest] = entry.split("|");
      return {
        nombre: (nombre || "").trim(),
        direccion: (rest.join("|") || "").trim(),
      };
    })
    .filter((s) => s.nombre);
}

function getSedes() {
  return parseSedes();
}

function getSedePorDefecto() {
  const sedes = getSedes();
  return sedes[0] || { nombre: "Sede Norte", direccion: "Avenida 6 Norte, Cali" };
}

function getSede(nombre) {
  const sedes = getSedes();
  return sedes.find((s) => s.nombre === nombre) || getSedePorDefecto();
}

module.exports = { parseSedes, getSedes, getSede, getSedePorDefecto, DEFAULT_SEDES };
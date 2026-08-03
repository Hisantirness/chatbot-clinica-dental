const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "clinica.db");

async function initDB() {
  if (fs.existsSync(DB_PATH)) {
    console.log("Base de datos ya existe en:", DB_PATH);
    return;
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS citas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      cedula TEXT NOT NULL,
      telefono TEXT NOT NULL,
      servicio TEXT NOT NULL,
      fecha TEXT NOT NULL,
      hora TEXT NOT NULL,
      dentista TEXT,
      email TEXT,
      recordatorio_enviado INTEGER DEFAULT 0,
      sede TEXT,
      confirm_token TEXT,
      confirmado INTEGER DEFAULT 0,
      recordatorio_enviado_en TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);

  console.log("Base de datos creada exitosamente en:", DB_PATH);
  console.log("Tabla 'citas' lista para usar.");

  db.close();
}

initDB().catch((err) => {
  console.error("Error al inicializar la base de datos:", err);
  process.exit(1);
});

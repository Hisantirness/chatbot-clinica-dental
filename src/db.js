const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "clinica.db");

let db = null;

function ensureColumn(db, table, column, ddl) {
  const res = db.exec(`PRAGMA table_info(${table})`);
  const cols = res.length > 0 ? res[0].values.map((row) => row[1]) : [];
  if (!cols.includes(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

async function getDB() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

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

  ensureColumn(db, "citas", "dentista", "dentista TEXT");
  ensureColumn(db, "citas", "email", "email TEXT");
  ensureColumn(db, "citas", "recordatorio_enviado", "recordatorio_enviado INTEGER DEFAULT 0");
  ensureColumn(db, "citas", "sede", "sede TEXT");
  ensureColumn(db, "citas", "confirm_token", "confirm_token TEXT");
  ensureColumn(db, "citas", "confirmado", "confirmado INTEGER DEFAULT 0");
  ensureColumn(db, "citas", "recordatorio_enviado_en", "recordatorio_enviado_en TEXT");

  saveDB();
  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

module.exports = { getDB, saveDB, ensureColumn };

# Chatbot Clínica Dental Sonrisa Sana

[![CI](https://github.com/Hisantirness/chatbot-clinica-dental/actions/workflows/ci.yml/badge.svg)](https://github.com/Hisantirness/chatbot-clinica-dental/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-42%20local%2C%207%20integration-brightgreen)](#)
[![Node](https://img.shields.io/badge/node-20.x-339933?logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Groq](https://img.shields.io/badge/Groq-Llama%203.3%2070B-orange)](#)

Chatbot web inteligente de atención al cliente para clínica dental. Responde preguntas frecuentes, consulta disponibilidad y **reserva citas reales** en base de datos, todo mediante lenguaje natural.

---

## Demo

La app está corriendo en producción:  
👉 **[chatbot-clinica-dental-production.up.railway.app](https://chatbot-clinica-dental-production.up.railway.app)**

## Screenshot

![Chatbot Screenshot](public/screenshot.png)

## Tech Stack

| Capa | Tecnología |
|------|-----------|
| **Runtime** | Node.js 20 |
| **Framework** | Express 4 |
| **LLM API** | Groq (Llama 3.3 70B, tier gratis, 14,400 req/día) |
| **Base de datos** | SQLite via sql.js |
| **Frontend** | HTML + CSS + JS vanilla (sin frameworks) |
| **Testing** | Vitest (25 unit + 17 server + 7 integración) |
| **CI/CD** | GitHub Actions + Railway |
| **Seguridad** | Helmet, CORS, rate-limit, sanitización XSS, panel admin con token |

## Features

### Chatbot inteligente
- Responde 14 FAQs de la clínica (horarios, servicios, precios, EPS, etc.)
- Consulta disponibilidad de citas en tiempo real
- Agenda citas recopilando todos los datos del paciente
- Consulta y cancela citas existentes por teléfono
- Tool calling loop con Groq (máximo 5 iteraciones)
- Retry automático en rate-limit de Groq

### Gestión de citas
- `consultar_disponibilidad` — horarios libres para una fecha
- `reservar_cita` — agenda cita con nombre, cédula, teléfono, servicio
- `consultar_mis_citas` — lista todas las citas de un paciente
- `cancelar_cita` — cancela cita verificando propiedad

### Seguridad
- Helmet: HTTP headers seguros
- CORS configurado
- Rate limit: 20 req/min en `/api/*`
- Validación: max 500 chars por mensaje
- Payload JSON limitado a 10 KB
- Sanitización XSS en inputs
- Logs JSON estructurados
- `ADMIN_TOKEN` protege la API de citas y el panel administrativo
- Export CSV sanitizado contra fórmula injection
- Audit logging de todas las operaciones administrativas

### Panel Admin
Panel web protegido por token para gestionar citas:

| Ruta | Descripción |
|------|-------------|
| `GET /admin` | Interfaz web del panel (login con token) |
| `GET /api/admin/citas` | Lista todas las citas ordenadas (requiere token) |
| `GET /api/admin/citas/export` | Descarga CSV de todas las citas (requiere token) |

Accede en `/admin` e ingresa tu `ADMIN_TOKEN`. Desde el panel puedes ver estadísticas, listar citas, cancelarlas y exportar a CSV.

### CI/CD
Pipeline automatizado en cada push a `master`:

```
npm ci → init-db → npm audit → lint → test → verify
```

## API

### `GET /health`
Health check para Railway.

```json
{ "status": "ok", "timestamp": "2026-07-31T00:00:00.000Z" }
```

### `POST /api/chat`
Envía un mensaje al chatbot.

```json
{
  "message": "¿Qué horarios tienen mañana?",
  "history": []
}
```

```json
{
  "reply": "Tenemos disponibles: 08:00, 08:45, 09:30, ..."
}
```

### `GET /api/citas?telefono=3001234567`
Consulta citas por teléfono. Requiere `Authorization: Bearer <ADMIN_TOKEN>`.

```json
{
  "citas": [
    {
      "id": 1,
      "nombre": "Juan Pérez",
      "cedula": "123456789",
      "telefono": "3001234567",
      "servicio": "limpieza",
      "fecha": "2026-08-10",
      "hora": "08:00"
    }
  ]
}
```

### `DELETE /api/citas/:id`
Cancela una cita por ID. Requiere `Authorization: Bearer <ADMIN_TOKEN>`. Para cancelar una cita propia, incluye el teléfono: `DELETE /api/citas/1?telefono=3001234567`.

```json
{ "exito": true, "mensaje": "Cita 1 cancelada exitosamente." }
```

## Estructura

```
chatbot-clinica-dental/
├── .github/workflows/ci.yml   # Pipeline CI
├── public/
│   ├── index.html              # Chat UI
│   ├── style.css               # Estilos responsive
│   ├── script.js               # Lógica frontend
│   ├── admin.html              # Panel admin UI
│   └── admin.js                # Lógica del panel admin
├── src/
│   ├── server.js               # Express server
│   ├── tools.js                # 4 herramientas del chatbot
│   ├── db.js                   # Conexión SQLite
│   ├── faq-context.js          # 14 FAQs + system prompt
│   ├── init-db.js              # Script de inicialización
│   ├── tools.test.mjs          # 25 tests unitarios
│   ├── server.test.mjs         # 17 tests del servidor Express
│   ├── test-setup.mjs          # DB temporal aislada para tests
│   └── integration.test.mjs    # 7 tests de integración
├── vitest.config.mjs
├── Dockerfile
├── package.json
└── README.md
```

## Quick Start

```bash
# 1. Clonar
git clone https://github.com/Hisantirness/chatbot-clinica-dental.git
cd chatbot-clinica-dental

# 2. Instalar
npm install

# 3. Configurar API key (gratis en console.groq.com)
echo "GROQ_API_KEY=gsk_tu-api-key-aqui" > .env

# 4. Inicializar BD y arrancar
npm run init-db
npm start
```

Abrir `http://localhost:3000` 🚀

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm start` | Inicia servidor en puerto 3000 |
| `npm run dev` | Modo watch (recarga automática) |
| `npm test` | 42 tests locales (25 unit + 17 server) — CI |
| `npm run test:server` | 17 tests del servidor Express |
| `npm run test:integration` | 7 tests contra Railway (requiere `RAILWAY_URL`) |
| `npm run test:all` | Todos los tests (locales + integración) |
| `npm run init-db` | Crea BD solo si no existe |
| `npm run lint` | ESLint |

## Variables de Entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `GROQ_API_KEY` | Sí | API key de Groq |
| `ADMIN_TOKEN` | Sí* | Token para acceder al panel admin y API de citas |
| `PORT` | No | Puerto (default: 3000) |
| `RAILWAY_URL` | No | URL para tests de integración |
| `DB_PATH` | No | Ruta de la BD (en Railway: `/data/clinica.db`) |

*Se recomienda configurarlo. Si no está, los endpoints de citas quedan sin protección.

> **Railway (production):** configura un Volume montado en `/data` y la variable `DB_PATH=/data/clinica.db` para que las citas persistan entre deploys.

## Licencia

MIT © Santiago Villa

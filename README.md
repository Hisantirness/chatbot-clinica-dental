# Chatbot Clínica Dental Sonrisa Sana

[![CI](https://github.com/Hisantirness/chatbot-clinica-dental/actions/workflows/ci.yml/badge.svg)](https://github.com/Hisantirness/chatbot-clinica-dental/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-43%20local%20%2B%207%20integration-brightgreen)](#)
[![Node](https://img.shields.io/badge/node-20.x-339933?logo=node.js)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Groq](https://img.shields.io/badge/Groq-Llama%203.3%2070B-orange)](#)
[![Deploy](https://img.shields.io/badge/deploy-Railway-7b00ff?logo=railway)](#)

Chatbot web inteligente de atención al cliente para clínica dental. Responde preguntas frecuentes, consulta disponibilidad y **reserva citas reales** en base de datos, todo mediante lenguaje natural.

---

## Demo

La app está corriendo en producción:  
👉 **[chatbot-clinica-dental-production.up.railway.app](https://chatbot-clinica-dental-production.up.railway.app)**

## Screenshots

Chat del paciente:

![Chatbot Screenshot](public/screenshot.png)

Panel administrativo:

![Panel Admin Screenshot](public/screenshot-admin.png)

## Arquitectura

### Diagrama de flujo

```
                    ┌──────────────────────────────────────────────────┐
                    │                  CLIENTE (Browser)               │
                    │   index.html + style.css + script.js             │
                    │   admin.html + admin.css + admin.js              │
                    └───────────────────────┬──────────────────────────┘
                                            │ HTTP (same-origin)
                                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      EXPRESS SERVER (src/server.js)                  │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────────┐  │
│  │ Helmet      │  │ CORS         │  │ Rate limit (20 req/min)     │  │
│  │ CSP estricto│  │ allowlist    │  │ JSON body ≤ 10 KB           │  │
│  │ HSTS, etc.  │  │ (origin fijo)│  │ + request logger + audit    │  │
│  └─────────────┘  └──────────────┘  └──────────────┬──────────────┘  │
│                                                    │                │
│        ┌────────────────────────────────────────────┴───────┐        │
│        │                    ROUTES                          │        │
│        │  /health        → status + timestamp               │        │
│        │  /              → public/index.html                │        │
│        │  /admin         → public/admin.html                │        │
│        │  POST /api/chat → loop tool-calling con Groq       │        │
│        │  GET  /api/citas?telefono=      (Bearer token)     │        │
│        │  DELETE /api/citas/:id         (Bearer token)      │        │
│        │  GET  /api/admin/citas         (Bearer token)      │        │
│        │  GET  /api/admin/citas/export  (Bearer token)      │        │
│        └───────────────────────┬────────────────────────────┘        │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                  ▼
   ┌────────────────┐  ┌───────────────┐  ┌──────────────────┐
   │  Groq API      │  │  src/tools.js │  │  src/db.js       │
   │  (Llama 3.3    │  │  4 tools      │  │  (sql.js)        │
   │   70B)         │  │  tool schemas │  │                  │
   │  tool calling  │  │  + ejecución  │  │  ┌────────────┐  │
   └────────────────┘  └──────┬────────┘  │  │ clinica.db │  │
                              │           │  │ (Volume)   │  │
                              └──────────►│  └────────────┘  │
                                          └──────────────────┘
```

### Flujo del chatbot (tool calling loop)

```
Usuario escribe mensaje
        │
        ▼
POST /api/chat ──► sanitize(message) ──► [system prompt + history + message]
        │
        ▼
Groq chat.completions (tools: consultar_disponibilidad, reservar_cita,
                          consultar_mis_citas, cancelar_cita)
        │
        ▼
   ¿tool_calls? ──NO──► devolver reply al usuario
        │
       SÍ (máx. 5 iteraciones)
        ▼
   Ejecutar la tool sobre la BD (sql.js)
        │
        └──► append resultado como mensaje "tool" ──► Groq de nuevo
```

### Componentes

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| **Servidor HTTP** | `src/server.js` | Express, middleware de seguridad, rutas, auth admin, loop de tool-calling |
| **Herramientas** | `src/tools.js` | Lógica de negocio: disponibilidad, reserva, consulta y cancelación de citas |
| **Base de datos** | `src/db.js` | Abre/guarda la BD SQLite (sql.js), crea tabla `citas` si no existe |
| **Contexto del LLM** | `src/faq-context.js` | System prompt + 14 FAQs de la clínica |
| **Inicialización** | `src/init-db.js` | Crea la BD solo si no existe (corre en `npm start` y en Railway) |
| **Chat UI** | `public/script.js` | Frontend del chat, historial, indicador de escritura, retry |
| **Admin UI** | `public/admin.js` | Panel admin, login con token, estadísticas, CSV |
| **Config** | `vitest.config.mjs` | Aísla la DB de pruebas por proceso |

### Decisiones de arquitectura

- **SQLite vía sql.js** — Cero dependencias de servicios externos; la BD es un solo archivo portable. Se exporta y guarda con `saveDB()` tras cada escritura.
- **Tool calling del LLM** — El modelo decide cuándo tocar la BD; el servidor solo valida argumentos y ejecuta. Esto permite lenguaje natural sin parseadores propios.
- **Validación doble** — Las tools validan en `tools.js` (teléfono colombiano `3XXXXXXXXX`, fecha válida, horario disponible) y el servidor valida inputs del cliente (longitud, tipo).
- **Auth por Bearer token** — `ADMIN_TOKEN` con `crypto.timingSafeEqual` (constante de tiempo, sin comparación vulnerable). El panel envía el token en header `Authorization`, nunca en la URL.
- **Persistencia serverless** — `DB_PATH` apunta al Volume de Railway (`/data/clinica.db`), así la BD sobrevive deploys.


## Retos técnicos resueltos

Este proyecto no es un chatbot genérico: cada problema de producción real se resolvió y quedó documentado.

- **Tool calling multi-turno con LLM** — El modelo decide cuándo llamar `consultar_disponibilidad`, `reservar_cita`, `consultar_mis_citas` o `cancelar_cita`, con un loop de máximo 5 iteraciones y retry automático ante rate-limit de Groq (backoff progresivo).
- **Zonas horarias en producción** — El servidor corría en UTC pero la clínica está en Colombia (UTC-5). `getFechaHoy()` usa `Intl.DateTimeFormat` con `America/Bogota` para que las fechas de citas sean correctas.
- **Persistencia en entorno serverless** — Railway no persiste el filesystem entre deploys. La BD SQLite (sql.js) se guarda en un Volume montado en `/data` vía `DB_PATH`, y `init-db.js` respeta una BD existente.
- **Cuota diaria de la API gratuita** — Groq free tier tiene límite de 14,400 req/día. El sistema detecta `429`/cuota agotada y responde al usuario con un mensaje amable en vez de fallar.
- **Bug de seguridad real encontrado y corregido** — La política CSP de Helmet bloqueaba los scripts inline del frontend. Se migró todo a archivos externos y `onclick` → `addEventListener`, manteniendo la protección CSP intacta.
- **Tests idempotentes** — Los tests escribían en la DB real y fallaban en la segunda corrida. Se aisló la DB de pruebas en un archivo temporal por proceso (`test-setup.mjs`).

## Tech Stack

| Capa | Tecnología |
|------|-----------|
| **Runtime** | Node.js 20 |
| **Framework** | Express 4 |
| **LLM API** | Groq (Llama 3.3 70B, tier gratis, 14,400 req/día) |
| **Base de datos** | SQLite via sql.js |
| **Frontend** | HTML + CSS + JS vanilla (sin frameworks) |
| **Testing** | Vitest (26 unit + 17 server + 7 integración) |
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
- CSP estricta sin `unsafe-inline` (scripts y estilos externos)
- `Permissions-Policy` que niega cámara, micrófono, geolocalización y pago
- CORS con allowlist de orígenes (rechaza orígenes desconocidos)
- Rate limit: 20 req/min en `/api/*`
- Validación: max 500 chars por mensaje
- Payload JSON limitado a 10 KB
- Sanitización XSS en inputs
- Logs JSON estructurados
- `ADMIN_TOKEN` protege la API de citas y el panel administrativo (comparación en tiempo constante)
- Token admin siempre por header `Authorization: Bearer`, nunca en la URL
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

### Deployment
La app se despliega automáticamente en **Railway** con cada push a `master` (auto-deploy):

- URL: https://chatbot-clinica-dental-production.up.railway.app
- **Volume** montado en `/data` para persistir la BD entre deploys
- **Health check** en `/health` para monitoreo de Railway

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
│   ├── admin.css               # Estilos del panel admin
│   ├── admin.js                # Lógica del panel admin
│   ├── screenshot.png          # Captura del chat
│   └── screenshot-admin.png    # Captura del panel admin
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
| `npm test` | 43 tests locales (26 unit + 17 server) — CI |
| `npm run test:server` | 17 tests del servidor Express |
| `npm run test:integration` | 7 tests contra Railway (usa la URL por defecto) |
| `npm run test:all` | Todos los tests (locales + integración) |
| `npm run init-db` | Crea BD solo si no existe |
| `npm run lint` | ESLint |

## Variables de Entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `GROQ_API_KEY` | Sí | API key de Groq |
| `ADMIN_TOKEN` | Sí* | Token para acceder al panel admin y API de citas |
| `PORT` | No | Puerto (default: 3000) |
| `DB_PATH` | No | Ruta de la BD (en Railway: `/data/clinica.db`) |
| `CORS_ORIGINS` | No | Orígenes permitidos separados por coma (default: dominio de producción en Railway) |

*Se recomienda configurarlo. Si no está, los endpoints de citas quedan sin protección.

## Licencia

MIT © Santiago Villa

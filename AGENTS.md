# Chatbot Clínica Dental "Sonrisa Sana"

## Descripción
Chatbot web de atención al cliente para la Clínica Dental Sonrisa Sana.
Responde preguntas frecuentes, consulta disponibilidad y reserva citas reales en DB.

## Stack
- Frontend: HTML/CSS/JS vanilla (public/)
- Backend: Node.js + Express (src/server.js)
- API: Groq (Llama 3.3 70B, tier gratis, 14,400 req/día)
- DB: SQLite via sql.js (src/db.js, src/tools.js)
- Testing: Vitest
- CI/CD: GitHub Actions (.github/workflows/ci.yml)

## Archivos clave
- `src/server.js` — Express, endpoint POST /api/chat, tool calling loop con Groq
- `src/faq-context.js` — 12 FAQs + system prompt con reglas de agendamiento
- `src/tools.js` — Tool schemas (consultar_disponibilidad, reservar_cita) + funciones
- `src/db.js` — Conexión/peristencia SQLite
- `src/init-db.js` — Script para crear DB limpia (npm run init-db)
- `public/` — Chat UI (HTML/CSS/JS)

## Endpoints
- POST /api/chat — body: { message: string, history: array } — response: { reply: string }
- GET / — sirve el frontend estático

## Reglas del proyecto
- Idioma: español
- Tono: amigable y profesional
- Las FAQs son la fuente de verdad. Responder con paráfrasis.
- NO derivar a WhatsApp si alguna FAQ cubre el tema.
- Para agendar: recopilar TODOS los datos uno por uno antes de llamar reservar_cita.
- clinica.db está en .gitignore. Correr npm run init-db para crear DB local.

## Cómo correr
1. npm install
2. Crear .env con GROQ_API_KEY
3. npm run init-db
4. npm start

## CI/CD
El pipeline corre en push/PR a master: npm ci → npm audit → npm test → validación de entorno.

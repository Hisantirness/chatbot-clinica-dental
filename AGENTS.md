# Chatbot Clínica Dental "Sonrisa Sana"

## Descripción
Chatbot web de atención al cliente para la clínica dental Sonrisa Sana.
Responde preguntas frecuentes usando la API de Claude.

## Stack
- Frontend: HTML/CSS/JS vanilla (público/)
- Backend: Node.js + Express (src/server.js)
- API: Anthropic Claude (SDK oficial)

## FAQ Context
Las FAQs están en src/faq-context.js y se envían como contexto del sistema
a Claude para que responda basado en esa información.

## Instrucciones
- Idioma: español
- Tono: amigable y profesional
- Prompt del sistema: usa las FAQs como fuente de verdad
- Si el usuario pregunta algo fuera de las FAQs, derivar amablemente a
  contacto por WhatsApp o llamada

## Endpoints
- POST /api/chat — body: { message: string } — response: { reply: string }
- GET / — sirve el frontend estático

## Cómo correr
1. npm install
2. Crear .env con ANTHROPIC_API_KEY
3. npm start

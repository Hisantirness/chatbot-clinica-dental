# Chatbot Clínica Dental Sonrisa Sana

Chatbot web de atención al cliente para la Clínica Dental Sonrisa Sana (Cali, Colombia). Responde preguntas frecuentes, consulta disponibilidad y reserva citas usando IA.

## Stack

- **Backend:** Node.js + Express
- **Frontend:** HTML/CSS/JS vanilla
- **IA:** Groq API (Llama 3.3 70B, tier gratis — 14,400 req/día)
- **Base de datos:** SQLite (vía sql.js)

## Requisitos

- Node.js 18+
- Una API key de [Groq](https://console.groq.com) (gratis, sin tarjeta de crédito)

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/Hisantirness/chatbot-clinica-dental.git
cd chatbot-clinica-dental

# 2. Instalar dependencias
npm install

# 3. Configurar API key
cp .env.example .env
# Editar .env y agregar tu GROQ_API_KEY

# 4. Inicializar base de datos
npm run init-db

# 5. Iniciar servidor
npm start
```

El servidor arranca en `http://localhost:3000`.

## Uso

Abrir `http://localhost:3000` en el navegador. El chatbot puede:

- Responder preguntas frecuentes (horarios, servicios, precios, ubicación)
- Consultar disponibilidad de citas
- Reservar citas (solicita nombre, cédula, teléfono, servicio, fecha y hora)

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Frontend del chat |
| POST | `/api/chat` | Enviar mensaje al chatbot |

### POST /api/chat

```json
{
  "message": "string",
  "history": [{ "role": "user|assistant", "content": "string" }]
}
```

## Desarrollo

```bash
npm run dev    # Con autorecarga (Node --watch)
npm run test   # Tests con Vitest
npm run init-db # Reinicializar base de datos
```

## Estructura del proyecto

```
chatbot-clinica-dental/
├── src/
│   ├── server.js        # Servidor Express
│   ├── faq-context.js   # FAQs + system prompt
│   ├── tools.js         # Tool schemas + funciones (disponibilidad, reserva)
│   ├── db.js            # Conexión SQLite
│   └── init-db.js       # Script para crear DB desde cero
├── public/
│   ├── index.html       # Chat UI
│   ├── style.css        # Estilos
│   └── script.js        # Lógica del frontend
├── .github/workflows/   # CI con GitHub Actions
└── package.json
```

## Licencia

MIT

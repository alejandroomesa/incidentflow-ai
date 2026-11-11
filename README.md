# IncidentFlow AI

Plataforma para registrar, clasificar y gestionar incidencias de protección de datos con asistencia de inteligencia artificial y supervisión humana.

**Demo:** [incidentflow-ai-production.up.railway.app](https://incidentflow-ai-production.up.railway.app)

La aplicación anonimiza la descripción antes de enviarla al proveedor de IA, devuelve una clasificación estructurada y propone actuaciones. Ninguna actuación sensible se ejecuta sin una aprobación humana explícita y todo el proceso queda reflejado en un historial de auditoría.

> IncidentFlow AI es una demostración técnica. La clasificación generada no es asesoramiento jurídico ni sustituye la valoración de un profesional de protección de datos.

## Funcionalidades

- Panel responsive con métricas, búsqueda y filtros por estado.
- Selector persistente español/inglés para toda la interfaz.
- Alta manual de incidencias y ejemplos precargados para demostraciones.
- Recepción automatizada mediante webhook firmado con HMAC-SHA256.
- Anonimización de correos y teléfonos antes de consultar a la IA.
- Clasificación por categoría, gravedad y nivel de confianza.
- Traducción ES/EN de la descripción, explicación y propuestas en la misma llamada a la IA.
- Propuesta de actuaciones estructuradas y priorizadas.
- Puerta de aprobación humana antes de ejecutar acciones sensibles.
- Evaluación de riesgo y resolución automática únicamente para casos de bajo riesgo compatibles con un protocolo interno.
- Historial de auditoría de creación, análisis, decisiones y ejecución.
- Estados de carga, errores recuperables y progreso visible durante el análisis.
- Health check de aplicación y base de datos para despliegues en Railway.

## Cómo actúa la IA

```text
Incidencia
   │
   ▼
Anonimización de PII ──► hash del texto anonimizado para auditoría
   │
   ▼
OpenRouter / modelo configurado
   │
   ▼
Salida validada con Zod
   ├── categoría
   ├── gravedad
   ├── confianza
   ├── explicación orientativa
   └── actuaciones propuestas
   │
   ▼
Evaluación de riesgo
   ├── riesgo bajo ──► protocolo automático permitido
   └── riesgo medio/alto ──► aprobación humana obligatoria
```

El backend fuerza una única respuesta estructurada mediante una llamada de herramienta (`return_classification`). La respuesta se valida antes de guardarse; un texto libre o una categoría no permitida se rechazan. El prompt obliga a marcar el resultado como provisional y a devolver descripción, explicación y actuaciones tanto en español como en inglés.

La IA no importa ni puede invocar las herramientas que crean tareas o notifican a consultores. Esas herramientas solo están disponibles en la capa de servicio y se ejecutan después de validar una aprobación humana. Esta separación está comprobada por tests.

## Rendimiento del análisis

La latencia depende principalmente del proveedor y del modelo configurado. Los modelos gratuitos de OpenRouter pueden tener cola, limitar peticiones o cambiar según disponibilidad.

El flujo actual está optimizado para realizar **una sola petición al modelo**. La configuración relevante es:

| Variable | Valor predeterminado | Uso |
| --- | ---: | --- |
| `CLAUDE_MODEL` | `nvidia/nemotron-nano-9b-v2:free` | Modelo o router de OpenRouter |
| `AI_REQUEST_TIMEOUT_MS` | `60000` | Tiempo máximo de espera del backend |
| `AI_MAX_TOKENS` | `2200` | Presupuesto máximo de la respuesta bilingüe |

La interfaz espera hasta 70 segundos y muestra la fase y el tiempo transcurrido. Si se usa `openrouter/free`, una demora ocasional sigue siendo esperable porque el enrutador gratuito prioriza disponibilidad y coste, no latencia. Para una demo más predecible puede elegirse otro modelo `:free` disponible, sin cambiar el código.

## Arquitectura

```text
public/                         Panel web en JavaScript y Tailwind CSS
src/
├── ai/                        Proveedor, prompt, esquema y orquestación de IA
├── anonymization/             Enmascarado de información personal
├── audit/                     Registro de trazabilidad
├── auto-resolution/           Protocolos de resolución de bajo riesgo
├── modules/incidents/         API, servicio y acceso a datos
├── modules/protocols/         Validación y ejecución de protocolos
├── tools/                     Acciones aisladas del agente
└── webhooks/                  Ingesta firmada e idempotente
db/                            Esquema y migraciones MySQL
scripts/                       Migración y simulación de webhooks
tests/                         Tests unitarios, de rutas y propiedades
```

## Tecnologías

- Node.js 20, TypeScript y Express.
- MySQL 8.
- OpenRouter mediante el SDK compatible de OpenAI.
- Zod para validar entradas, configuración y salida de la IA.
- Vitest, Supertest y fast-check.
- Tailwind CSS y JavaScript sin framework en el frontend.
- Docker y Railway para despliegue.

## Ejecución local

Requisitos: Node.js 20+, npm, Docker y una clave de OpenRouter.

```bash
git clone https://github.com/alejandroomesa/incidentflow-ai.git
cd incidentflow-ai
npm install
```

1. Copia `.env.example` como `.env` y completa `OPENROUTER_API_KEY` y `WEBHOOK_SECRET`.
2. Arranca MySQL y aplica las migraciones.
3. Inicia el servidor de desarrollo.

```bash
docker compose up -d mysql
npm run db:migrate
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). La API de salud está disponible en [http://localhost:3000/api/health](http://localhost:3000/api/health).

También puedes levantar la aplicación y MySQL juntos con:

```bash
docker compose up -d
```

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `PORT` | No | Puerto HTTP; Railway lo proporciona automáticamente |
| `NODE_ENV` | No | `development`, `test` o `production` |
| `DB_HOST`, `DB_PORT` | Sí | Host y puerto de MySQL |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Sí | Credenciales y base de datos |
| `OPENROUTER_API_KEY` | Sí | Clave privada de OpenRouter |
| `OPENROUTER_BASE_URL` | No | API compatible; por defecto OpenRouter |
| `CLAUDE_MODEL` | No | Identificador del modelo configurado |
| `AI_REQUEST_TIMEOUT_MS` | No | Timeout de la petición al modelo |
| `AI_MAX_TOKENS` | No | Límite de tokens de salida |
| `WEBHOOK_SECRET` | Sí | Secreto usado para verificar firmas HMAC |
| `WEBHOOK_MAX_AGE_SECONDS` | No | Antigüedad máxima aceptada para un webhook |
| `ALLOWED_SERVICES_TO_RESTART` | No | Lista permitida para la herramienta de reinicio |
| `ACTION_TIMEOUT_MS` | No | Timeout individual de una acción automática |
| `AUTO_RESOLVE_TIMEOUT_MS` | No | Timeout total de un protocolo automático |

Nunca publiques el archivo `.env` ni copies claves reales en capturas, commits o documentación.

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Salud del servicio y conexión a MySQL |
| `POST` | `/api/incidents` | Crear una incidencia |
| `GET` | `/api/incidents` | Listar incidencias |
| `GET` | `/api/incidents/:id` | Consultar una incidencia |
| `POST` | `/api/incidents/:id/analyze` | Analizar y clasificar con IA |
| `GET` | `/api/incidents/:id/actions` | Listar actuaciones propuestas |
| `GET` | `/api/incidents/:id/analysis` | Consultar explicación, modelo y duración del último análisis |
| `POST` | `/api/incidents/:id/approve` | Aprobar y ejecutar una actuación |
| `POST` | `/api/incidents/:id/reject` | Rechazar una actuación |
| `GET` | `/api/incidents/:id/audit` | Consultar la auditoría |
| `POST` | `/api/webhooks/incidents` | Recibir un webhook firmado |

## Tests y calidad

```bash
npm test
npm run build
```

La suite cubre anonimización, validación de la salida de IA, firmas y repetición de webhooks, rutas HTTP, puerta de aprobación, evaluación de riesgo, protocolos, timeouts y herramientas permitidas.

## Guion de demostración

1. Abre la demo y pulsa **Nueva incidencia**.
2. Selecciona uno de los ejemplos o escribe un caso propio.
3. Abre la incidencia y pulsa **Analizar con IA**.
4. Observa el progreso, la clasificación, la gravedad y la confianza.
5. Revisa las actuaciones propuestas y aprueba o rechaza una.
6. Abre el historial de auditoría para mostrar la trazabilidad completa.

Para demostrar la ingesta automática, configura `WEBHOOK_SECRET` y ejecuta:

```bash
node scripts/simulate-webhook.mjs valid
```

También existen los escenarios `bad-signature`, `stale` y `replay` para enseñar los controles de seguridad.

## Despliegue en Railway

El repositorio incluye `railway.json` y una migración previa al despliegue. En Railway:

1. Crea un servicio desde este repositorio y añade un servicio MySQL.
2. Configura las variables de base de datos usando las referencias del servicio MySQL.
3. Añade `OPENROUTER_API_KEY`, `WEBHOOK_SECRET`, `CLAUDE_MODEL` y las variables opcionales de IA.
4. Genera un dominio público; la aplicación escucha el `PORT` inyectado por Railway.

El health check es `/api/health`. Cada push a `main` inicia un nuevo despliegue.

## Seguridad y límites conocidos

- El enmascarado actual usa expresiones regulares; una solución de producción necesitaría detección de PII más completa.
- La aplicación de demostración no incorpora autenticación ni control de roles.
- Las herramientas de creación de tareas y notificaciones simulan integraciones mediante registros y base de datos.
- Los modelos gratuitos no ofrecen una garantía de latencia o disponibilidad.
- Antes de un uso real serían necesarios gestión de secretos, rate limiting, observabilidad, copias de seguridad y revisión jurídica y de seguridad.

## Próximos pasos

- Autenticación y roles de analista, revisor y administrador.
- Notificaciones reales por correo, Slack o un sistema de tickets.
- Métricas de latencia, coste y calidad por modelo.
- Procesamiento asíncrono del análisis con una cola de trabajos.
- Exportación de informes y auditorías en PDF.

---

Proyecto desarrollado como demostración de arquitectura de agentes seguros: IA estructurada, privacidad por diseño, acciones con aprobación humana y trazabilidad de extremo a extremo.

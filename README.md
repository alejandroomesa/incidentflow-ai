# IncidentFlow AI

Agente de clasificación y gestión de incidencias de protección de datos. Recibe
una incidencia (formulario o webhook firmado), la anonimiza, la clasifica con IA,
propone actuaciones y **exige aprobación humana** antes de ejecutar cualquier
acción sensible. Todo queda registrado en un historial de auditoría.

> La IA nunca emite una resolución jurídica definitiva. Es una herramienta de
> clasificación y apoyo para el consultor — no un sustituto del consultor.

## Stack

Node.js + TypeScript + Express · MySQL (Docker Compose) · OpenRouter (modelo
Claude vía API compatible con OpenAI) · Zod · Vitest + Supertest · Tailwind (CDN)
+ vanilla JS para el panel.

## Puesta en marcha

1. Copia `.env.example` a `.env` y rellena:
   - `OPENROUTER_API_KEY` — tu clave de [OpenRouter](https://openrouter.ai/settings/keys)
   - `WEBHOOK_SECRET` — cualquier cadena para firmar los webhooks de la demo
2. Levanta MySQL:
   ```
   docker compose up -d mysql
   ```
3. Aplica las migraciones de base de datos (si es necesario):
   ```powershell
   # Windows PowerShell
   .\scripts\apply-migration-003.ps1
   ```
   ```bash
   # Linux/Mac/WSL
   ./scripts/apply-migration-003.sh
   ```
4. Instala dependencias y arranca el servidor:
   ```
   npm install
   npm run dev
   ```
5. Abre [http://localhost:3000](http://localhost:3000) para el panel, o
   `curl http://localhost:3000/api/health` para comprobar la conexión a BD.

Alternativa: `docker compose up -d` levanta MySQL **y** la app dentro de Docker
(usa entonces `docker compose logs -f app` para ver los logs).

**Nota**: La migración 003 añade soporte para resolución automática de incidencias.
Consulta `db/MIGRATION_003_README.md` para más detalles.

## Ejecutar tests

```
npm test
```

29 tests: anonimización de PII, validación Zod de la salida de la IA, verificación
de firma de webhook (válida/inválida/repetida/caducada), y la puerta de
aprobación humana (incluida una comprobación de que `src/ai/**` nunca importa las
tools sensibles).

## Endpoints

```
POST   /api/incidents                 Crear incidencia manualmente
GET    /api/incidents                 Listar incidencias
GET    /api/incidents/:id             Ver una incidencia
POST   /api/incidents/:id/analyze     Clasificar con IA
POST   /api/incidents/:id/approve     Aprobar una actuación propuesta {actionId, approvedBy}
POST   /api/incidents/:id/reject      Rechazar una actuación propuesta {actionId, rejectedBy, reason?}
GET    /api/incidents/:id/actions     Listar actuaciones propuestas
GET    /api/incidents/:id/audit       Historial de auditoría

POST   /api/webhooks/incidents        Ingesta firmada (HMAC)

GET    /api/health                    Estado del servicio y de la BD
```

## Guion de demo (4–5 min)

1. Abre el panel (`http://localhost:3000`) — no hay incidencias pendientes.
2. Simula un webhook firmado:
   ```
   WEBHOOK_SECRET=<tu valor de .env> node scripts/simulate-webhook.mjs valid
   ```
3. Recarga el panel — la incidencia aparece con estado `pending`.
4. Entra en la incidencia y pulsa **Analyze with AI**.
5. Se muestra la clasificación estructurada (categoría, gravedad, confianza,
   nota de razonamiento) etiquetada explícitamente como "pending consultant
   review" — nunca como un veredicto.
6. Aprueba una de las actuaciones propuestas (p. ej. `create_internal_task`).
7. La tarea se "crea" (se ejecuta la tool, visible en los logs del servidor) y
   la actuación pasa a `executed`.
8. Abre el historial de auditoría de la incidencia — se ve cada paso: creación,
   inicio de análisis, clasificación, aprobación, ejecución.
9. Simula un webhook con firma incorrecta:
   ```
   WEBHOOK_SECRET=<tu valor de .env> node scripts/simulate-webhook.mjs bad-signature
   ```
10. El servidor responde `401 invalid_signature`.

Bonus: `node scripts/simulate-webhook.mjs stale` (rechazado por timestamp
caducado) y `node scripts/simulate-webhook.mjs replay <deliveryId>` repetido dos
veces (la segunda vez responde `already_processed`, sin duplicar la incidencia).

## Decisiones de diseño relevantes

- **Human-in-the-loop real, no solo documentado**: `src/ai/**` nunca importa
  `src/tools/create-task.tool.ts` ni `src/tools/notify-consultant.tool.ts` — la
  IA no tiene ningún camino de código para ejecutarlas. Solo
  `incident.service.ts` las invoca, y solo tras `approveAction`. Verificado por
  test (`tests/approval-gate.test.ts`).
- **La IA nunca resuelve legalmente**: el system prompt de `claude.provider.ts`
  prohíbe explícitamente afirmaciones legales definitivas (p. ej. sobre
  obligación de notificar a la AEPD) y fuerza `requiresHumanReview: true` en
  cada respuesta.
- **Sin prompts con PII en logs**: `agent_runs.input_hash` almacena
  `SHA256(descripción anonimizada)`, nunca el texto original.
- **Anonimización antes de la IA**: `src/anonymization/pii-mask.ts` enmascara
  emails y teléfonos antes de enviar nada al proveedor de IA. Es una
  aproximación por regex, suficiente para una demo — no un motor de detección
  de PII de producción.
- **Webhook firmado**: HMAC-SHA256 sobre el cuerpo crudo (no el JSON
  re-serializado), comparación con `timingSafeEqual`, idempotencia vía
  restricción `UNIQUE` en `webhook_deliveries.delivery_id`, y rechazo de
  timestamps con más de `WEBHOOK_MAX_AGE_SECONDS` (300s por defecto) de
  antigüedad.
- **Proveedor de IA desacoplado**: `ai-provider.interface.ts` define el
  contrato; `claude.provider.ts` lo implementa vía OpenRouter (modelo Claude);
  `gemini.provider.ts` es solo un stub que documenta el punto de extensión.

## Limitaciones conocidas (demo, no producción)

- El enmascarado de PII es por regex, no NLP.
- `notify_consultant` y `create_internal_task` solo registran en consola/BD —
  no hay integración real con email/Slack/ticketing.
- No hay autenticación de usuarios en el panel — cualquiera con acceso a la red
  puede aprobar/rechazar (fuera de alcance para esta demo).

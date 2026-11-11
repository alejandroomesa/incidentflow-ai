# Plan de Implementación: Auto-Incident-Resolution

## Resumen

Este plan implementa el sistema de resolución automática de incidencias, permitiendo que el agente IA clasifique riesgo y resuelva automáticamente incidencias de bajo riesgo siguiendo protocolos predefinidos. Las incidencias de riesgo medio/alto requieren aprobación humana. Todas las acciones quedan auditadas para trazabilidad y cumplimiento.

**Enfoque consolidado**: Este plan agrupa actividades relacionadas para reducir el número de tareas y acelerar la implementación.

## Tareas

### Fase 1: Infraestructura y Evaluación de Riesgo

- [x] 1. Configurar base de datos y modelos de datos
  - Crear script de migración `003_auto_resolution.sql`
  - Tablas nuevas: `risk_evaluations`, `protocols`, `auto_resolutions`, `pii_mappings`
  - Modificar tabla `incidents`: añadir `risk_level ENUM('low','medium','high')`, `resolved_at TIMESTAMP`
  - Modificar tabla `proposed_actions`: añadir `original_parameters JSON`, `modified_by VARCHAR(255)`, `modified_at TIMESTAMP`
  - Crear índices: `idx_status_risk_created`, `idx_category_active`, etc.
  - Poblar protocolos por defecto para categorías principales + fallback "other"
  - _Requirements: 1.2, 2.6, 4.1, 5.1, 5.2, 9.3_

- [-] 2. Implementar y testear Risk Evaluator completo
  - Crear `risk-evaluator.service.ts` con algoritmo de scoring
  - Factores: severidad (40pts), categoría (30pts), confianza (20pts), metadata (10pts)
  - Clasificación: >=60 high, >=30 medium, <30 low
  - Schemas Zod: `RiskEvaluationResult`, `RiskFactor`
  - Integrar en `incident-agent.ts`: llamar después de clasificación
  - Almacenar en tabla `risk_evaluations` y actualizar `incidents.risk_level`
  - _Requirements: 1.2, 1.3, 1.5_

- [ ]* 2.1 Property tests y unit tests para Risk Evaluator
  - **Property 1**: risk_level siempre low/medium/high
  - **Property 2**: rationale siempre no vacío
  - Unit test: alta severidad → high risk
  - Unit test: baja confianza (<0.6) → aumenta risk score
  - Unit test: fallo en evaluación → defaultea a high risk
  - _Requirements: 1.2, 1.3, 1.5_


### Fase 2: Gestión de Protocolos

- [-] 3. Implementar sistema completo de Protocol Manager
  - Interfaces TypeScript: `Protocol`, `ProtocolStep`, `ProtocolCondition`, enum `ActionType`
  - Schemas Zod para validación
  - Repository `protocol.repository.ts`: CRUD completo, soft delete, query por categoría (más reciente activo)
  - Service `protocol-manager.service.ts`: validación exhaustiva (campos requeridos, semver, dependencias circulares, parámetros por actionType)
  - Parser `protocol-parser.ts`: JSON → Protocol y Protocol → JSON con indentación 2 espacios
  - Extracción de línea/columna de errores de sintaxis JSON
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 10.1, 10.2, 10.3, 10.5, 10.6_

- [ ]* 3.1 Property tests y unit tests para Protocol Manager y Parser
  - **Property 4**: categoría válida retorna protocolo (o fallback "other")
  - **Property 12**: protocolo almacenado tiene estructura válida
  - **Property 13**: query por categoría retorna el más reciente activo
  - **Property 14**: protocolos inválidos son rechazados
  - **Property 29-34**: Parsing exitoso, errores descriptivos, formateo consistente, **round-trip**, validación campos, validación dependencias
  - Unit tests: crear/actualizar/eliminar protocolos, dependencias circulares rechazadas, lista con filtros
  - _Requirements: 5.2, 5.3, 5.4, 5.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 4. Checkpoint de protocolos
  - Verificar que protocolos por defecto están en BD
  - Verificar que el parser hace round-trip correctamente
  - Verificar que la validación rechaza protocolos inválidos
  - Preguntar al usuario si hay dudas


### Fase 3: Auto-Resolución y Acciones

- [~] 5. Implementar Auto Resolver completo con ejecución paralela
  - Service `auto-resolver.service.ts`: lógica de ejecución de protocolos
  - Recuperar protocolo por categoría (o marcar requiring_approval si no existe)
  - Construir grafo de dependencias y hacer topological sort
  - Ejecutar steps en batches: paralelo dentro de batch, secuencial entre batches
  - Timeouts: 30s por acción, 5min total
  - Retry con backoff exponencial (máximo 3 intentos para errores transitorios)
  - Registrar todo en tabla `auto_resolutions` y audit log
  - Marcar incidencia como resolved/failed según resultado
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [~] 6. Implementar acción restart_service y testear ejecución de acciones
  - Tool `restart-service.tool.ts`: simulación de reinicio (versión demo con logs)
  - Validar whitelist de servicios permitidos (configurado en .env)
  - Registrar en audit log: service_restart_initiated, service_restart_success/failed
  - Integrar en Auto Resolver junto con create_task y notify_consultant existentes
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ]* 6.1 Property tests y unit tests para Auto Resolver y acciones
  - **Property 3**: risk_level=low se auto-resuelve sin aprobación
  - **Property 5**: ejecución secuencial respeta orden
  - **Property 6**: incidencia resolved tiene resolved_at
  - **Property 20-23**: Ejecución correcta de create_task, notify_consultant, restart_service, paso de parámetros completos
  - **Property 24**: continúa si todas las acciones previas son success
  - Unit tests: protocolo no encontrado, fallo en acción detiene ejecución, timeout, reinicio exitoso actualiza status
  - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 8.1, 8.2, 8.3, 8.4_


### Fase 4: Approval Gate y Anonimización PII

- [~] 7. Implementar Approval Gate mejorado con soporte para acciones modificadas
  - Extender `incident.service.ts`: función `evaluateApprovalGate`
  - Si risk_level=low → llamar Auto Resolver automáticamente
  - Si risk_level=medium/high → marcar requiring_approval y notificar consultor
  - Función `processApproval(incidentId, approvedBy, modifiedActions?)`: validar estado, registrar approval en audit log, ejecutar Auto Resolver con acciones modificadas si se proporcionaron
  - Función `processRejection(incidentId, rejectedBy, reason?)`: marcar rejected, registrar en audit log
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 7.1 Property tests y unit tests para Approval Gate
  - **Property 7**: medium/high requiere aprobación
  - Unit tests: aprobar ejecuta acciones, rechazar marca rejected, modificar acciones antes de aprobar, error al aprobar estado inválido
  - _Requirements: 3.1, 3.3, 3.4, 3.5_

- [~] 8. Implementar sistema completo de anonimización PII con encriptación
  - Module `pii-encryption.ts`: encryptPII/decryptPII con AES-256-CBC, IV aleatorio, clave desde env `PII_ENCRYPTION_KEY`
  - Extender `pii-mask.ts`: tokenization consistente (EMAIL_1, PHONE_1, IP_1), mismo valor PII → mismo token
  - Service `pii-mapping.service.ts`: repository para `pii_mappings`, almacenar mapeos token → valor encriptado
  - Función `deanonymize(token, userId, userRole)`: control de acceso (solo admin), registrar acceso en audit log
  - Integrar tokenization en `incident-agent.ts`: generar tokens y almacenar mapeos antes de enviar a IA
  - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6_

- [ ]* 8.1 Property tests y unit tests para PII
  - **Property 25**: PII anonimizado antes de enviar a IA
  - **Property 26**: mismo PII → mismo token
  - **Property 27**: mapeo almacenado recuperable
  - **Property 28**: respuestas API anonimizadas sin include_pii=true
  - Unit tests: email → EMAIL_1, múltiples emails diferentes generan tokens distintos, admin ve datos originales
  - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6_

- [~] 9. Checkpoint de flujo completo
  - Verificar flujo bajo riesgo: webhook → clasificación → auto-resolución → resolved
  - Verificar flujo alto riesgo: webhook → clasificación → requiring_approval → aprobación → resolved
  - Verificar que PII se anonimiza correctamente
  - Preguntar al usuario si hay dudas


### Fase 5: Auditoría, APIs y Dashboard

- [~] 10. Extender sistema de auditoría y testear
  - Añadir eventos: risk_evaluated, approval_required, incident_approved, incident_rejected, action_execution_started/success/failed, incident_auto_resolved, service_restart_initiated/success/failed, pii_accessed
  - Implementar `AuditLogBatcher`: batch inserts (flush cada 100ms o cada 10 logs)
  - Mejoras de performance: índices, particionamiento por mes
  - _Requirements: 4.1, 4.2, 4.3_

- [ ]* 10.1 Property tests para Audit Service
  - **Property 8**: logs tienen todos los campos requeridos
  - **Property 9**: logs son inmutables
  - **Property 10**: filtrado correcto de logs
  - **Property 11**: PII anonimizado en consultas sin include_pii=true
  - _Requirements: 4.1, 4.2, 4.5, 4.6_

- [~] 11. Implementar APIs completas (Protocol + Incident extendido)
  - **Protocol API** (`protocol.controller.ts`, `protocol.routes.ts`):
    - POST /api/protocols - Crear
    - GET /api/protocols - Listar con filtros
    - GET /api/protocols/:id - Obtener
    - PUT /api/protocols/:id - Actualizar
    - DELETE /api/protocols/:id - Soft delete
    - Middleware: rol protocol_admin requerido
  - **Incident API extendido**:
    - POST /api/incidents/:id/approve - Con `modifiedActions` opcional
    - GET /api/incidents/:id/risk-evaluation - Retornar evaluación
    - GET /api/incidents/:id/resolution - Detalles de auto-resolución
    - Modificar GET /api/incidents para incluir `risk_level`
  - _Requirements: 3.3, 3.5, 5.3, 5.4_

- [ ]* 11.1 Integration tests para APIs
  - Test flujo Protocol API: crear → listar → obtener → actualizar → eliminar
  - Test Incident API: aprobación con acciones modificadas, consulta risk-evaluation, consulta resolution
  - Test autorización: rechaza sin rol protocol_admin
  - _Requirements: 3.3, 5.3, 5.5_


- [~] 12. Actualizar Dashboard UI completo
  - Añadir columna `risk_level` a tabla de incidencias con estilos visuales (low=verde, medium=amarillo, high=rojo)
  - Añadir filtros: dropdown risk_level, date pickers para date_range
  - Vista de detalle: mostrar evaluación de riesgo con factors, mostrar acciones ejecutadas con timestamps/resultados
  - Permitir editar acciones propuestas antes de aprobar (textarea JSON o form dinámico)
  - Botones aprobar/rechazar solo visibles para requiring_approval
  - _Requirements: 7.2, 7.3, 7.4, 7.5, 3.5_

- [ ]* 12.1 Property tests para Dashboard UI
  - **Property 17**: todos los campos requeridos presentes en renderizado
  - **Property 18**: filtros muestran solo incidencias que cumplen criterios
  - **Property 19**: botones aprobación solo visibles para requiring_approval
  - _Requirements: 7.2, 7.3, 7.5_

### Fase 6: Testing Exhaustivo y Optimización

- [~] 13. Completar property tests pendientes y tests de integración
  - **Property 15**: verificación firma HMAC de webhook
  - **Property 16**: rechazo de payloads inválidos (400 con mensaje descriptivo)
  - Integration test: flujo completo bajo riesgo (webhook → resolved)
  - Integration test: flujo completo alto riesgo (webhook → requiring_approval → aprobación → resolved)
  - Integration test: flujo con modificación de acciones
  - Verificar coverage: todas las 34 propiedades implementadas, mínimo 100 iteraciones cada una
  - _Requirements: 6.2, 6.6, 1.1, 2.1, 3.1, 3.3, 3.5_

- [~] 14. Implementar optimizaciones de performance y tests
  - Circuit Breaker para AI Provider: clase `AIProviderCircuitBreaker`, 5 fallos consecutivos → pausar 1min, integrar en `incident-agent.ts`
  - Optimizar consultas dashboard: verificar índices con EXPLAIN, caché con TTL 10s, paginación (límite 50)
  - Performance tests: análisis IA <5s (95%), webhook <500ms, auto-resolución 3 acciones <10s, dashboard 100 incidencias <1s
  - _Requirements: 1.4, 6.5, 7.3_


### Fase 7: Documentación y Finalización

- [~] 15. Completar documentación y preparar demo
  - Actualizar README.md: describir auto-resolución, variables de entorno nuevas (PII_ENCRYPTION_KEY, AUTO_RESOLVE_TIMEOUT_MS, ALLOWED_SERVICES_TO_RESTART, etc.)
  - Crear guía de gestión de protocolos: ejemplos JSON para cada categoría, formato con comentarios, best practices
  - Documentar ADRs: fast-check para PBT, scoring basado en reglas, JSON para protocolos, soft delete, AES-256 para PII, circuit breaker
  - Actualizar diagramas de arquitectura
  - Preparar demo script con casos de uso
  - _Requirements: Documentación_

- [~] 16. Checkpoint final y validación completa
  - Ejecutar suite completa de tests (unit + property + integration + performance)
  - Verificar coverage: 80% total, 100% componentes críticos (Risk Evaluator, Auto Resolver, Approval Gate)
  - Demo con usuario: flujo bajo riesgo, flujo alto riesgo con aprobación, modificación de acciones
  - Validar que todas las funcionalidades cumplen requerimientos
  - Resolver dudas finales

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4"] },
    { "id": 3, "tasks": ["5", "6"] },
    { "id": 4, "tasks": ["6.1", "7"] },
    { "id": 5, "tasks": ["7.1", "8"] },
    { "id": 6, "tasks": ["8.1", "9"] },
    { "id": 7, "tasks": ["10", "11"] },
    { "id": 8, "tasks": ["10.1", "11.1", "12"] },
    { "id": 9, "tasks": ["12.1", "13"] },
    { "id": 10, "tasks": ["14"] },
    { "id": 11, "tasks": ["15"] },
    { "id": 12, "tasks": ["16"] }
  ]
}
```


## Notas de Implementación

### Consolidación de Tareas

Este plan **consolida significativamente** el número de tareas respecto a planes anteriores:
- **Antes**: 67 tareas granulares
- **Ahora**: 29 tareas principales (16 implementación + 13 testing opcionales)

**Estrategia de consolidación aplicada**:
- Implementación + tests agrupados en la misma tarea principal con sub-tarea opcional de tests
- Actividades relacionadas fusionadas (ej: repository + service + schemas en una sola tarea)
- Property tests agrupados por componente en lugar de una tarea por propiedad
- Configuración y setup consolidados

### Tareas Marcadas con `*`

Las tareas con `*` son **opcionales** (principalmente testing) y pueden omitirse para un MVP más rápido. Sin embargo, se **recomienda fuertemente** implementarlas para garantizar robustez.

**Testing opcional incluye**:
- Property tests (validan propiedades universales)
- Unit tests exhaustivos (casos específicos y edge cases)
- Integration tests end-to-end
- Performance tests

**Implementación core (NO opcional)**:
- Todas las tareas sin `*` son obligatorias
- Incluyen funcionalidad principal del sistema
- Sin estas, el sistema no funciona

### Orden de Prioridad

Las fases están ordenadas para validación incremental:
1. **Fase 1**: Infraestructura (BD + Risk Evaluator)
2. **Fase 2**: Gestión de protocolos
3. **Fase 3**: Auto-resolución y acciones
4. **Fase 4**: Approval gate y PII
5. **Fase 5**: Auditoría, APIs, dashboard
6. **Fase 6**: Testing exhaustivo y optimización
7. **Fase 7**: Documentación y finalización

Cada fase tiene un checkpoint para validar progreso antes de continuar.


### Referencias a Requerimientos

Cada tarea incluye referencias específicas a los criterios de aceptación del documento de requerimientos (`requirements.md`), facilitando la trazabilidad entre implementación y especificación.

Formato: `_Requirements: 1.2, 3.4, 5.1_` indica que la tarea valida los criterios de aceptación 1.2, 3.4 y 5.1.

### Property Tests

Todas las **34 propiedades de correctitud** definidas en el documento de diseño están cubiertas por tareas de property testing. Cada property test debe:

- Ejecutar **mínimo 100 iteraciones** con fast-check
- Incluir tag de referencia: `// Feature: auto-incident-resolution, Property {N}: {texto completo de la propiedad}`
- Referenciar el número de requerimiento que valida

**Propiedades críticas que requieren especial atención**:
- **Property 32 (Round-trip)**: Esencial para Protocol Parser - parse → print → parse debe producir equivalente
- **Property 7 (Bloqueo)**: Crítico para seguridad - medium/high NUNCA deben auto-resolverse
- **Property 9 (Inmutabilidad)**: Crítico para auditoría - logs nunca deben modificarse
- **Property 25 (Anonimización)**: Crítico para privacidad - PII nunca enviado a IA sin anonimizar

### Checkpoints Estratégicos

Los **5 checkpoints** están ubicados después de implementar funcionalidad crítica:

1. **Checkpoint 4** (después de protocolos): Validar que protocolos se gestionan correctamente
2. **Checkpoint 9** (después de flujo completo): Validar integración end-to-end
3. **Checkpoint 16** (final): Validación completa con usuario

**Objetivo de checkpoints**:
- Validar funcionamiento correcto hasta ese punto
- Permitir al usuario hacer preguntas o pedir ajustes
- Evitar acumulación de errores en fases posteriores
- Puntos de decisión: continuar, ajustar, o re-planificar


### Lenguaje de Implementación

El proyecto utiliza **TypeScript** con Node.js, por lo que todas las tareas de código se implementarán en TypeScript siguiendo las convenciones del proyecto existente:

- Framework web: **Express.js**
- Base de datos: **MySQL** con cliente `mysql2`
- Testing: **Vitest** (framework de testing actual)
- Property-based testing: **fast-check** (nueva dependencia)
- Schemas: **Zod** (validación en runtime)
- AI Provider: **OpenRouter/Claude** (ya integrado)

**Estructura de código esperada**:
```
src/
├── ai/
│   ├── risk-evaluator.service.ts        [NUEVO]
│   └── incident-agent.ts                [MODIFICAR]
├── auto-resolution/
│   ├── auto-resolver.service.ts         [NUEVO]
│   ├── protocol-manager.service.ts      [NUEVO]
│   ├── protocol-parser.ts               [NUEVO]
│   └── approval-gate.service.ts         [NUEVO]
├── modules/
│   ├── incidents/
│   │   └── incident.service.ts          [MODIFICAR]
│   └── protocols/
│       ├── protocol.controller.ts       [NUEVO]
│       ├── protocol.repository.ts       [NUEVO]
│       └── protocol.routes.ts           [NUEVO]
├── anonymization/
│   ├── pii-mask.ts                      [MODIFICAR]
│   ├── pii-mapping.service.ts           [NUEVO]
│   └── pii-encryption.ts                [NUEVO]
├── tools/
│   └── restart-service.tool.ts          [NUEVO]
└── audit/
    └── audit.service.ts                 [MODIFICAR]
```

### Estimación de Tiempo

**Con testing completo** (todas las tareas incluyendo `*`):
- Fase 1: 2 días
- Fase 2: 2 días
- Fase 3: 2 días
- Fase 4: 2 días
- Fase 5: 2 días
- Fase 6: 2 días
- Fase 7: 1 día
- **Total: ~13 días** de desarrollo full-time

**MVP sin testing opcional** (omitir tareas `*`):
- Fase 1-5: 6 días (implementación core)
- Fase 6: 1 día (tests críticos + optimizaciones básicas)
- Fase 7: 1 día (documentación mínima)
- **Total: ~8 días** de desarrollo full-time

**Recomendación**: Implementar con testing completo para garantizar calidad y evitar bugs en producción.

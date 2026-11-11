// Ayuda para la demo: envía una solicitud webhook correctamente firmada (o deliberadamente
// rota) a POST /api/webhooks/incidents, para que no tengas que calcular a mano
// una firma HMAC con curl durante una demo en vivo.
//
// Usage:
//   WEBHOOK_SECRET=<value from .env> node scripts/simulate-webhook.mjs valid
//   WEBHOOK_SECRET=<value from .env> node scripts/simulate-webhook.mjs bad-signature
//   WEBHOOK_SECRET=<value from .env> node scripts/simulate-webhook.mjs stale
//   WEBHOOK_SECRET=<value from .env> node scripts/simulate-webhook.mjs replay <deliveryId>
import { createHmac, randomUUID } from 'node:crypto';

const secret = process.env.WEBHOOK_SECRET;
if (!secret) {
  console.error('Set WEBHOOK_SECRET (see .env) before running this script.');
  process.exit(1);
}

const scenario = process.argv[2] || 'valid';

const payload = {
  company: 'Empresa Demo SL',
  description:
    'Un empleado ha enviado por error un listado de clientes a un proveedor externo no autorizado.',
  reportedBy: 'Departamento de IT',
  timestamp:
    scenario === 'stale' ? new Date(Date.now() - 10 * 60 * 1000).toISOString() : new Date().toISOString(),
};

const body = JSON.stringify(payload);
const signature =
  scenario === 'bad-signature'
    ? 'sha256=' + '0'.repeat(64)
    : 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

const deliveryId = scenario === 'replay' && process.argv[3] ? process.argv[3] : randomUUID();

const res = await fetch('http://localhost:3000/api/webhooks/incidents', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': signature,
    'X-Webhook-Delivery': deliveryId,
    'X-Webhook-Event': 'incident.created',
  },
  body,
});

console.log('status:', res.status);
console.log('deliveryId:', deliveryId);
console.log(await res.text());

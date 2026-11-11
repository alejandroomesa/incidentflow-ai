import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { checkConnection } from './config/database.js';
import { errorHandler, notFoundHandler } from './shared/middleware/error-handler.middleware.js';
import { incidentRouter } from './modules/incidents/incident.routes.js';
import { webhookRouter } from './webhooks/webhook.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Crea y configura la aplicación Express
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());

  // Configura la ruta para manejar los webhooks entrantes
  app.use('/api/webhooks', webhookRouter);

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Ruta de verificación de estado para comprobar la conectividad con la base de datos
  app.get('/api/health', async (_req, res) => {
    const dbOk = await checkConnection();
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'connected' : 'unreachable',
    });
  });

  app.use('/api/incidents', incidentRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

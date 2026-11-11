import express, { Router } from 'express';
import { captureRawBody, verifyWebhookSignature } from './verify-signature.middleware.js';
import { webhookController } from './webhook.controller.js';

export const webhookRouter = Router();

// Configura el middleware para capturar el cuerpo sin procesar 
// de la solicitud y verificar la firma del webhook
webhookRouter.use(express.json({ verify: captureRawBody }));
webhookRouter.post('/incidents', verifyWebhookSignature, webhookController.handleIncidentWebhook);

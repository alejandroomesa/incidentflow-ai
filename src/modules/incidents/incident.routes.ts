import { Router } from 'express';
import { incidentController } from './incident.controller.js';

export const incidentRouter = Router();

incidentRouter.post('/', incidentController.create);
incidentRouter.get('/', incidentController.list);
incidentRouter.get('/:id', incidentController.getById);
incidentRouter.post('/:id/analyze', incidentController.analyze);
incidentRouter.post('/:id/approve', incidentController.approve);
incidentRouter.post('/:id/reject', incidentController.reject);
incidentRouter.get('/:id/audit', incidentController.audit);
incidentRouter.get('/:id/actions', incidentController.listActions);

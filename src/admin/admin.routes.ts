import { Router } from 'express';
import { requireAdminToken } from './admin-auth.middleware.js';
import { deleteIncidentHistory } from './admin.repository.js';

export const adminRouter = Router();

adminRouter.use(requireAdminToken);

adminRouter.post('/verify', (_req, res) => {
  res.json({ status: 'ok' });
});

adminRouter.delete('/incidents', async (_req, res, next) => {
  try {
    const deletedIncidents = await deleteIncidentHistory();
    console.info(`Admin cleanup deleted ${deletedIncidents} incidents`);
    res.json({ status: 'deleted', deletedIncidents });
  } catch (error) {
    next(error);
  }
});

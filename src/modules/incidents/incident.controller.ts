import type { NextFunction, Request, Response } from 'express';
import { auditService } from '../../audit/audit.service.js';
import { incidentService } from './incident.service.js';
import { runIncidentAnalysis } from '../../ai/incident-agent.js';
import {
  ApproveActionSchema,
  CreateIncidentSchema,
  IncidentIdParamSchema,
  RejectActionSchema,
} from './incident.schema.js';

export const incidentController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = CreateIncidentSchema.parse(req.body);
      const incident = await incidentService.createIncident(input);
      res.status(201).json(incident);
    } catch (err) {
      next(err);
    }
  },

  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const incidents = await incidentService.listIncidents();
      res.json(incidents);
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = IncidentIdParamSchema.parse(req.params);
      const incident = await incidentService.getIncident(id);
      res.json(incident);
    } catch (err) {
      next(err);
    }
  },

  async analyze(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = IncidentIdParamSchema.parse(req.params);
      const output = await runIncidentAnalysis(id);
      res.json(output);
    } catch (err) {
      next(err);
    }
  },

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = IncidentIdParamSchema.parse(req.params);
      const { actionId, approvedBy } = ApproveActionSchema.parse(req.body);
      await incidentService.approveAction(id, actionId, approvedBy);
      res.json({ status: 'approved' });
    } catch (err) {
      next(err);
    }
  },

  async reject(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = IncidentIdParamSchema.parse(req.params);
      const { actionId, rejectedBy, reason } = RejectActionSchema.parse(req.body);
      await incidentService.rejectAction(id, actionId, rejectedBy, reason ?? undefined);
      res.json({ status: 'rejected' });
    } catch (err) {
      next(err);
    }
  },

  async audit(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = IncidentIdParamSchema.parse(req.params);
      const logs = await auditService.findByIncident(id);
      res.json(logs);
    } catch (err) {
      next(err);
    }
  },

  async listActions(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = IncidentIdParamSchema.parse(req.params);
      const actions = await incidentService.listProposedActions(id);
      res.json(actions);
    } catch (err) {
      next(err);
    }
  },
};

import { z } from 'zod';

export const CreateIncidentSchema = z.object({
  company: z.string().min(1).max(255),
  source: z.enum(['manual', 'api', 'email', 'webhook']).default('manual'),
  description: z.string().min(10).max(10000),
  reportedBy: z.string().max(255).nullable().optional(),
  externalId: z.string().max(100).nullable().optional(),
});
export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;

export const ApproveActionSchema = z.object({
  actionId: z.coerce.number().int().positive(),
  approvedBy: z.string().min(1).max(255),
});
export type ApproveActionInput = z.infer<typeof ApproveActionSchema>;

export const RejectActionSchema = z.object({
  actionId: z.coerce.number().int().positive(),
  rejectedBy: z.string().min(1).max(255),
  reason: z.string().max(1000).nullable().optional(),
});
export type RejectActionInput = z.infer<typeof RejectActionSchema>;

export const IncidentIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

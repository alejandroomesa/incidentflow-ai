import { z } from 'zod';

export const IncidentCategorySchema = z.enum([
  'unauthorized_access',
  'data_breach_external_disclosure',
  'improper_data_sharing',
  'data_loss_destruction',
  'phishing_social_engineering',
  'system_misconfiguration',
  'physical_security',
  'other',
]);

export const IncidentSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const ProposedActionTypeSchema = z.enum(['create_internal_task', 'notify_consultant']);

export const ProposedActionSchema = z.object({
  type: ProposedActionTypeSchema,
  title: z.string().min(3).max(200),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

// Schema para la salida del agente de IA, que incluye la categoría del incidente, 
// severidad, confianza, razonamiento, si requiere revisión humana y las acciones propuestas
export const AgentOutputSchema = z.object({
  category: IncidentCategorySchema,
  severity: IncidentSeveritySchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(20).max(2000),
  requiresHumanReview: z.boolean().default(true),
  proposedActions: z.array(ProposedActionSchema).max(5),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;
export type ProposedAction = z.infer<typeof ProposedActionSchema>;
export type IncidentCategory = z.infer<typeof IncidentCategorySchema>;

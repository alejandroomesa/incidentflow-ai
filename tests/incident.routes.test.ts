import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/incidents/incident.service.js', () => ({
  incidentService: {
    createIncident: vi.fn(),
    listIncidents: vi.fn(),
    getIncident: vi.fn(),
    listProposedActions: vi.fn(),
    approveAction: vi.fn(),
    rejectAction: vi.fn(),
  },
}));

vi.mock('../src/audit/audit.service.js', () => ({
  auditService: {
    record: vi.fn(),
    findByIncident: vi.fn(),
  },
}));

const { createApp } = await import('../src/app.js');
const { incidentService } = await import('../src/modules/incidents/incident.service.js');
const { auditService } = await import('../src/audit/audit.service.js');

const app = createApp();

const sampleIncident = {
  id: 1,
  external_id: null,
  company_name: 'Empresa Demo SL',
  source: 'manual',
  description: 'Un empleado ha enviado datos por error.',
  reported_by: null,
  category: null,
  severity: null,
  confidence: null,
  status: 'pending',
  requires_human_review: 1,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('incidents routes', () => {
  it('POST /api/incidents creates an incident', async () => {
    vi.mocked(incidentService.createIncident).mockResolvedValue(sampleIncident as never);

    const res = await request(app)
      .post('/api/incidents')
      .send({ company: 'Empresa Demo SL', description: 'Un empleado ha enviado datos por error.' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
  });

  it('POST /api/incidents rejects an invalid payload', async () => {
    const res = await request(app).post('/api/incidents').send({ company: 'x' });
    expect(res.status).toBe(400);
  });

  it('GET /api/incidents lists incidents', async () => {
    vi.mocked(incidentService.listIncidents).mockResolvedValue([sampleIncident] as never);

    const res = await request(app).get('/api/incidents');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('GET /api/incidents/:id returns a single incident', async () => {
    vi.mocked(incidentService.getIncident).mockResolvedValue(sampleIncident as never);

    const res = await request(app).get('/api/incidents/1');
    expect(res.status).toBe(200);
    expect(res.body.company_name).toBe('Empresa Demo SL');
  });

  it('GET /api/incidents/:id/audit returns audit events as an array', async () => {
    vi.mocked(auditService.findByIncident).mockResolvedValue([
      { id: 1, incident_id: 1, event: 'incident_created', actor_type: 'system', actor_id: null, metadata: {}, created_at: '2026-01-01 00:00:00' },
    ] as never);

    const res = await request(app).get('/api/incidents/1/audit');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

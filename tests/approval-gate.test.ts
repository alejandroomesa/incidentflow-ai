import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/incidents/incident.repository.js', () => ({
  proposedActionRepository: {
    findById: vi.fn(),
    markApproved: vi.fn(),
    markRejected: vi.fn(),
    markExecuted: vi.fn(),
    markFailed: vi.fn(),
  },
  incidentRepository: {},
  agentRunRepository: {},
}));

vi.mock('../src/audit/audit.service.js', () => ({
  auditService: { record: vi.fn() },
}));

vi.mock('../src/tools/create-task.tool.js', () => ({
  createInternalTask: vi.fn().mockResolvedValue({ taskId: 'task-1' }),
}));

vi.mock('../src/tools/notify-consultant.tool.js', () => ({
  notifyConsultant: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
}));

const { incidentService } = await import('../src/modules/incidents/incident.service.js');
const { proposedActionRepository } = await import('../src/modules/incidents/incident.repository.js');
const { createInternalTask } = await import('../src/tools/create-task.tool.js');

beforeEach(() => {
  vi.clearAllMocks();
});

const pendingAction = {
  id: 10,
  incident_id: 1,
  agent_run_id: 1,
  action_type: 'create_internal_task',
  title: 'Do the thing',
  priority: 'high' as const,
  parameters: {},
  status: 'pending' as const,
  approved_by: null,
  approved_at: null,
  executed_at: null,
  created_at: '2026-01-01 00:00:00',
};

describe('approval gate', () => {
  it('approving a pending action calls the matching tool and marks it executed', async () => {
    vi.mocked(proposedActionRepository.findById).mockResolvedValue(pendingAction as never);

    await incidentService.approveAction(1, 10, 'consultant@example.com');

    expect(createInternalTask).toHaveBeenCalledWith({ incidentId: 1, title: 'Do the thing', priority: 'high' });
    expect(proposedActionRepository.markExecuted).toHaveBeenCalledWith(10);
  });

  it('rejects approving an action that is not pending, without calling the tool', async () => {
    vi.mocked(proposedActionRepository.findById).mockResolvedValue({
      ...pendingAction,
      status: 'executed',
    } as never);

    await expect(incidentService.approveAction(1, 10, 'consultant@example.com')).rejects.toThrow(/not pending/i);
    expect(createInternalTask).not.toHaveBeenCalled();
  });

  it('rejects approving an action belonging to a different incident', async () => {
    vi.mocked(proposedActionRepository.findById).mockResolvedValue(pendingAction as never);

    await expect(incidentService.approveAction(999, 10, 'consultant@example.com')).rejects.toThrow();
    expect(createInternalTask).not.toHaveBeenCalled();
  });

  it('the AI module never imports the sensitive action-executing tools', () => {
    const aiDir = join(process.cwd(), 'src', 'ai');
    const sensitiveImports = ['create-task.tool', 'notify-consultant.tool'];

    for (const file of readdirSync(aiDir)) {
      if (!file.endsWith('.ts')) continue;
      const contents = readFileSync(join(aiDir, file), 'utf-8');
      for (const sensitive of sensitiveImports) {
        expect(contents.includes(sensitive), `${file} must not import ${sensitive}`).toBe(false);
      }
    }
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = {
  beginTransaction: vi.fn(),
  execute: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};

vi.mock('../src/config/database.js', () => ({
  pool: { getConnection: vi.fn().mockResolvedValue(connection) },
}));

const { deleteIncidentHistory } = await import('../src/admin/admin.repository.js');

beforeEach(() => {
  vi.clearAllMocks();
  connection.execute
    .mockResolvedValueOnce([{ affectedRows: 4 }])
    .mockResolvedValueOnce([{ affectedRows: 3 }]);
});

describe('admin history cleanup', () => {
  it('deletes webhook deliveries and incidents in one transaction', async () => {
    await expect(deleteIncidentHistory()).resolves.toBe(3);

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.execute).toHaveBeenNthCalledWith(1, 'DELETE FROM webhook_deliveries');
    expect(connection.execute).toHaveBeenNthCalledWith(2, 'DELETE FROM incidents');
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases the connection when deletion fails', async () => {
    connection.execute.mockReset().mockRejectedValueOnce(new Error('database unavailable'));

    await expect(deleteIncidentHistory()).rejects.toThrow('database unavailable');

    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});

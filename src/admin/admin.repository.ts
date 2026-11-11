import type { ResultSetHeader } from 'mysql2';
import { pool } from '../config/database.js';

export async function deleteIncidentHistory(): Promise<number> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM webhook_deliveries');
    const [result] = await connection.execute<ResultSetHeader>('DELETE FROM incidents');
    await connection.commit();
    return result.affectedRows;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

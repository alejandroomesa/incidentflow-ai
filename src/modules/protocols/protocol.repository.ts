import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import type { CreateProtocolInput, UpdateProtocolInput, ProtocolFilters, Protocol } from './protocol.schema.js';

export interface ProtocolRow extends RowDataPacket {
  id: number;
  category: string;
  version: string;
  name: string;
  description: string;
  steps: unknown; // JSON column: string or pre-parsed object depending on driver typeCast
  conditions: unknown; // JSON column: string or pre-parsed object depending on driver typeCast
  is_active: number; // MySQL boolean as tinyint
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

// mysql2 auto-deserializes JSON columns into objects, but returns a raw string
// when the driver's typeCast doesn't kick in (e.g. depending on connection
// config) -- handle both to avoid a JSON.parse("[object Object]") crash.
function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  return typeof value === 'string' ? JSON.parse(value) : (value as T);
}

function rowToProtocol(row: ProtocolRow): Protocol {
  return {
    id: row.id,
    category: row.category as Protocol['category'],
    version: row.version,
    name: row.name,
    description: row.description,
    steps: parseJsonColumn(row.steps, []),
    conditions: parseJsonColumn(row.conditions, []),
    isActive: row.is_active === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    archivedAt: row.archived_at ? new Date(row.archived_at) : null,
  };
}

export const protocolRepository = {
  async create(input: CreateProtocolInput): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO protocols (category, version, name, description, steps, conditions, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.category,
        input.version,
        input.name,
        input.description,
        JSON.stringify(input.steps),
        JSON.stringify(input.conditions),
        input.isActive,
      ],
    );
    return result.insertId;
  },

  async findById(id: number): Promise<Protocol | null> {
    const [rows] = await pool.execute<ProtocolRow[]>(
      'SELECT * FROM protocols WHERE id = ? AND archived_at IS NULL',
      [id],
    );
    return rows[0] ? rowToProtocol(rows[0]) : null;
  },

  async findByCategory(category: string): Promise<Protocol | null> {
    const [rows] = await pool.execute<ProtocolRow[]>(
      `SELECT * FROM protocols 
       WHERE category = ? AND is_active = 1 AND archived_at IS NULL
       ORDER BY created_at DESC, updated_at DESC
       LIMIT 1`,
      [category],
    );
    return rows[0] ? rowToProtocol(rows[0]) : null;
  },

  async findAll(filters?: ProtocolFilters): Promise<Protocol[]> {
    let query = 'SELECT * FROM protocols WHERE archived_at IS NULL';
    const params: (string | number)[] = [];

    if (filters?.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters?.isActive !== undefined) {
      query += ' AND is_active = ?';
      params.push(filters.isActive ? 1 : 0);
    }

    if (filters?.search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      const searchParam = `%${filters.search}%`;
      params.push(searchParam, searchParam);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute<ProtocolRow[]>(query, params);
    return rows.map(rowToProtocol);
  },

  async update(id: number, input: UpdateProtocolInput): Promise<void> {
    const fields: string[] = [];
    const params: (string | number)[] = [];

    if (input.category !== undefined) {
      fields.push('category = ?');
      params.push(input.category);
    }
    if (input.version !== undefined) {
      fields.push('version = ?');
      params.push(input.version);
    }
    if (input.name !== undefined) {
      fields.push('name = ?');
      params.push(input.name);
    }
    if (input.description !== undefined) {
      fields.push('description = ?');
      params.push(input.description);
    }
    if (input.steps !== undefined) {
      fields.push('steps = ?');
      params.push(JSON.stringify(input.steps));
    }
    if (input.conditions !== undefined) {
      fields.push('conditions = ?');
      params.push(JSON.stringify(input.conditions));
    }
    if (input.isActive !== undefined) {
      fields.push('is_active = ?');
      params.push(input.isActive ? 1 : 0);
    }

    if (fields.length === 0) {
      return; // Nothing to update
    }

    // Add updated_at
    fields.push('updated_at = NOW()');
    params.push(id);

    const query = `UPDATE protocols SET ${fields.join(', ')} WHERE id = ? AND archived_at IS NULL`;
    await pool.execute(query, params);
  },

  async softDelete(id: number): Promise<void> {
    await pool.execute(
      'UPDATE protocols SET archived_at = NOW(), is_active = 0 WHERE id = ? AND archived_at IS NULL',
      [id],
    );
  },

  async exists(id: number): Promise<boolean> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT 1 FROM protocols WHERE id = ? AND archived_at IS NULL',
      [id],
    );
    return rows.length > 0;
  },
};

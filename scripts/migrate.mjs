import { readFile } from 'node:fs/promises';
import process from 'node:process';
import mysql from 'mysql2/promise';

const requiredVariables = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingVariables = requiredVariables.filter((name) => !process.env[name]);

if (missingVariables.length > 0) {
  throw new Error(`Missing database variables: ${missingVariables.join(', ')}`);
}

const connectionOptions = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
};

function withoutDatabaseSelection(sql) {
  return sql
    .replace(/^CREATE DATABASE[^;]+;\s*/gim, '')
    .replace(/^USE\s+[^;]+;\s*/gim, '');
}

async function connectWithRetry() {
  const attempts = 12;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await mysql.createConnection(connectionOptions);
    } catch (error) {
      if (attempt === attempts) throw error;
      const delayMs = Math.min(attempt * 1_000, 5_000);
      console.log(`Database unavailable (attempt ${attempt}/${attempts}); retrying...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('Could not connect to the database');
}

const migrations = [
  { id: '001_initial_schema', path: new URL('../db/init.sql', import.meta.url) },
  { id: '003_auto_resolution', path: new URL('../db/003_auto_resolution.sql', import.meta.url) },
];

const connection = await connectWithRetry();

try {
  const [[lock]] = await connection.query(
    "SELECT GET_LOCK('incidentflow_schema_migrations', 60) AS acquired",
  );

  if (lock.acquired !== 1) {
    throw new Error('Could not acquire the database migration lock');
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(100) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  for (const migration of migrations) {
    const [rows] = await connection.execute(
      'SELECT id FROM schema_migrations WHERE id = ? LIMIT 1',
      [migration.id],
    );

    if (rows.length > 0) {
      console.log(`Migration ${migration.id} already applied`);
      continue;
    }

    const sql = withoutDatabaseSelection(await readFile(migration.path, 'utf8'));
    console.log(`Applying migration ${migration.id}...`);
    await connection.query(sql);
    await connection.execute('INSERT INTO schema_migrations (id) VALUES (?)', [migration.id]);
    console.log(`Migration ${migration.id} applied`);
  }
} finally {
  try {
    await connection.query("SELECT RELEASE_LOCK('incidentflow_schema_migrations')");
  } finally {
    await connection.end();
  }
}


/**
 * Database migration runner
 *
 * Reads every *.sql file from src/db/migrations/ (sorted alphabetically),
 * tracks which ones have been applied in an `_applied_migrations` table,
 * and executes only the unapplied ones.
 *
 * Notes:
 *   - Migrations that contain CREATE INDEX CONCURRENTLY run outside a
 *     transaction (Postgres requires this).
 *   - All other migrations run inside a transaction for safety.
 *   - Safe to re-run — already-applied migrations are skipped.
 *
 * Usage: npm run db:migrate (from packages/api)
 */

import 'dotenv/config';
import pg from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in .env');
  process.exit(1);
}

console.log('🔌 Connecting to database...');

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('railway') || DATABASE_URL.includes('supabase')
    ? { rejectUnauthorized: false }
    : false,
});

// ── Ensure tracking table exists ────────────────────────────────────────────
await pool.query(`
  CREATE TABLE IF NOT EXISTS _applied_migrations (
    name        VARCHAR(255) PRIMARY KEY,
    applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
`);

// ── Gather migration files ──────────────────────────────────────────────────
const migrationsDir = join(__dirname, 'migrations');
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort(); // 0003, 0004, 0005, 0006, …

if (files.length === 0) {
  console.log('ℹ️  No migration files found.');
  await pool.end();
  process.exit(0);
}

// ── Determine which are already applied ─────────────────────────────────────
const { rows: applied } = await pool.query<{ name: string }>(
  'SELECT name FROM _applied_migrations ORDER BY name'
);
const appliedSet = new Set(applied.map((r) => r.name));

const pending = files.filter((f) => !appliedSet.has(f));

if (pending.length === 0) {
  console.log('✅ All migrations already applied — nothing to do.');
  await pool.end();
  process.exit(0);
}

console.log(`🚀 Running ${pending.length} pending migration(s)...`);

// ── Execute each pending migration ──────────────────────────────────────────
for (const file of pending) {
  const sql = readFileSync(join(migrationsDir, file), 'utf-8');
  const usesConcurrently = /CONCURRENTLY/i.test(sql);

  try {
    if (usesConcurrently) {
      // CONCURRENTLY cannot run inside a transaction — execute statements
      // one at a time on a bare client.
      const client = await pool.connect();
      try {
        // Split on semicolons, filter empty, and run each statement
        const statements = sql
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith('--'));

        for (const stmt of statements) {
          await client.query(stmt);
        }

        await client.query(
          'INSERT INTO _applied_migrations (name) VALUES ($1)',
          [file]
        );
      } finally {
        client.release();
      }
    } else {
      // Normal migration — wrap in a transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO _applied_migrations (name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(`  ✅ ${file}`);
  } catch (err) {
    console.error(`  ❌ ${file} failed:`, err);
    await pool.end();
    process.exit(1);
  }
}

console.log(`\n✅ All ${pending.length} migration(s) applied successfully.`);
await pool.end();

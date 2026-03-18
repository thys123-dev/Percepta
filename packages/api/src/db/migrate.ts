/**
 * Database migration runner
 * Runs all pending SQL migrations from src/db/migrations/
 * Usage: npm run db:migrate (from packages/api)
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
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

const db = drizzle(pool);

console.log('🚀 Running migrations...');

try {
  await migrate(db, {
    migrationsFolder: join(__dirname, 'migrations'),
  });
  console.log('✅ All migrations complete');
} catch (err) {
  console.error('❌ Migration failed:', err);
  process.exit(1);
} finally {
  await pool.end();
}

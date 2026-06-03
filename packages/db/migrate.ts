import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Programmatic migration runner. Used instead of `drizzle-kit migrate` because
// drizzle-kit 0.28 crashes on Node 26 trying to read a drizzle-studio cert.
// Idempotent: applies any pending files in ./drizzle and records them.
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required to run migrations.');

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder: './drizzle' });
await sql.end();

// eslint-disable-next-line no-console
console.log('[db] migrations applied');

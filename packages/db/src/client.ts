import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>;

/**
 * Create a Drizzle client backed by postgres.js.
 * `max` is kept small because Railway's starter Postgres has a low connection cap.
 */
export function createDb(databaseUrl: string) {
  const queryClient = postgres(databaseUrl, { max: 10 });
  return drizzle(queryClient, { schema });
}

export { schema };

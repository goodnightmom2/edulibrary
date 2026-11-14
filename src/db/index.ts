import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

function buildConnectionConfig() {
  const rawUrl = process.env.DATABASE_URL;
  if (rawUrl) {
    let cleanUrl = rawUrl;
    let needsSsl =
      process.env.NODE_ENV === 'production' ||
      rawUrl.includes('sslmode=') ||
      rawUrl.includes('supabase.com') ||
      rawUrl.includes('supabase.co') ||
      rawUrl.includes('neon.tech');
    try {
      const parsed = new URL(rawUrl);
      if (parsed.searchParams.has('sslmode')) {
        needsSsl = parsed.searchParams.get('sslmode') !== 'disable';
        parsed.searchParams.delete('sslmode');
        cleanUrl = parsed.toString();
      }
    } catch {
      // keep rawUrl if URL parsing fails
    }

    return {
      connectionString: cleanUrl,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      connectionTimeoutMillis: 15000,
    };
  }

  return {
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    max: 10,
    connectionTimeoutMillis: 15000,
  };
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool(buildConnectionConfig());

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });

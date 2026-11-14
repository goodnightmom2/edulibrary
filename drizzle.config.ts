import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.SQL_HOST
    ? `postgresql://${process.env.SQL_USER}:${encodeURIComponent(process.env.SQL_PASSWORD || '')}@${process.env.SQL_HOST}:5432/${process.env.SQL_DB_NAME}`
    : '');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
});

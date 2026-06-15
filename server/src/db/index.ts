import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;
console.log('[DB] DATABASE_URL set:', !!dbUrl);
console.log('[DB] DATABASE_URL host:', dbUrl ? new URL(dbUrl).hostname : 'NOT SET');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl?.includes('supabase.com')
    ? { rejectUnauthorized: false }
    : false,
});

export default pool;

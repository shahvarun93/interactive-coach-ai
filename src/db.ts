// src/db.ts
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Did you create your .env file?');
}

try {
    const url = new URL(process.env.DATABASE_URL);
    console.log('🔎 Connecting to Postgres host:', url.hostname);
} catch (e) {
    console.error('❌ DATABASE_URL is not a valid URL:', process.env.DATABASE_URL);
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function query(text: string, params?: any[]) {
  const res = await pool.query(text, params);
  return res;
}

export async function dbHealthCheck() {
  const res = await pool.query('SELECT NOW()');
  return res.rows[0];
}
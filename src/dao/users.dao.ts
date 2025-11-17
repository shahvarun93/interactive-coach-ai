import { query } from '../db';
import { User } from '../interfaces/User';

export async function getAllUsers(): Promise<User[]> {
    const res = await query('SELECT id, email, name, created_at FROM users_tbl ORDER BY created_at DESC');
    return res.rows as User[];
}

export async function createUser(email: string, name?: string): Promise<User> {
    const res = await query(
      `INSERT INTO users_tbl (email, name)
       VALUES ($1, $2)
       RETURNING id, email, name, created_at`,
      [email, name ?? null]
    );
    return res.rows[0] as User;
}

export async function findUserByEmail(email: string): Promise<User | null> {
    const res = await query(
      `SELECT id, email, name, created_at FROM users_tbl WHERE email = $1`,
      [email]
    );
    return res.rows[0] || null;
}
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSystemDesignSession = createSystemDesignSession;
exports.listSessionsForUser = listSessionsForUser;
const db_1 = require("../db");
async function createSystemDesignSession(userId, prompt) {
    const res = await (0, db_1.query)(`
      INSERT INTO system_design_sessions (user_id, prompt)
      VALUES ($1, $2)
      RETURNING id, user_id, prompt, answer, score, strengths, weaknesses, created_at, updated_at
      `, [userId, prompt]);
    return res.rows[0];
}
async function listSessionsForUser(userId) {
    const res = await (0, db_1.query)(`
      SELECT id, user_id, prompt, answer, score, strengths, weaknesses, created_at, updated_at
      FROM system_design_sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
      `, [userId]);
    return res.rows;
}

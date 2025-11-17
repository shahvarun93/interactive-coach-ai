"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllUsers = getAllUsers;
exports.createUser = createUser;
exports.findUserByEmail = findUserByEmail;
const db_1 = require("../db");
async function getAllUsers() {
    const res = await (0, db_1.query)('SELECT id, email, name, created_at FROM users_tbl ORDER BY created_at DESC');
    return res.rows;
}
async function createUser(email, name) {
    const res = await (0, db_1.query)(`INSERT INTO users_tbl (email, name)
       VALUES ($1, $2)
       RETURNING id, email, name, created_at`, [email, name ?? null]);
    return res.rows[0];
}
async function findUserByEmail(email) {
    const res = await (0, db_1.query)(`SELECT id, email, name, created_at FROM users_tbl WHERE email = $1`, [email]);
    return res.rows[0] || null;
}

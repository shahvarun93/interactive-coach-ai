"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
exports.dbHealthCheck = dbHealthCheck;
// src/db.ts
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
dotenv_1.default.config();
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Did you create your .env file?');
}
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});
async function query(text, params) {
    const res = await exports.pool.query(text, params);
    return res;
}
async function dbHealthCheck() {
    const res = await exports.pool.query('SELECT NOW()');
    return res.rows[0];
}

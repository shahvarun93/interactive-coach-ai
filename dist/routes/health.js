"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/health.ts
const express_1 = require("express");
const db_1 = require("../db");
const router = (0, express_1.Router)();
router.get('/health', async (_req, res) => {
    try {
        const dbNow = await (0, db_1.dbHealthCheck)();
        res.json({
            status: 'ok',
            dbTime: dbNow,
        });
    }
    catch (err) {
        console.error('Health check failed:', err);
        res.status(500).json({
            status: 'error',
            error: 'DB check failed',
        });
    }
});
exports.default = router;

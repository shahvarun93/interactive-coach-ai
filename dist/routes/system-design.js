"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/system-design.ts (or sd.ts)
const express_1 = require("express");
const system_design_service_1 = require("../services/system-design.service");
const users_service_1 = require("../services/users.service");
const router = (0, express_1.Router)();
// Create session by email
router.post('/by-email', async (req, res) => {
    try {
        const { email, prompt } = req.body;
        if (!email || !prompt) {
            return res.status(400).json({ error: 'email and prompt are required' });
        }
        const user = await (0, users_service_1.findUserByEmail)(email);
        if (!user) {
            return res.status(404).json({ error: 'No user found with this email' });
        }
        const session = await (0, system_design_service_1.createSystemDesignSession)(user.id, prompt);
        res.status(201).json(session);
    }
    catch (err) {
        console.error('Error creating SD session by email:', err);
        res.status(500).json({ error: 'Failed to create session' });
    }
});
// existing routes (e.g., POST /sd, GET /sd/user/:userId) ...
/**
 * POST /sd/generate-prompt
 * Body: { email: string, difficulty?: 'easy' | 'medium' | 'hard' }
 * - Looks up user by email
 * - Generates a system design question with OpenAI
 * - Creates a session in system_design_sessions
 * - Returns { sessionId, prompt, userId, difficulty }
 */
router.post('/generate-prompt', async (req, res) => {
    try {
        const { email, difficulty } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'email is required' });
        }
        const user = await (0, users_service_1.findUserByEmail)(email);
        if (!user) {
            return res.status(404).json({ error: 'No user found with this email' });
        }
        const { session, question } = await (0, system_design_service_1.createAISystemDesignSessionForUser)(user.id, difficulty ?? 'medium');
        res.status(201).json({
            sessionId: session.id,
            userId: session.user_id,
            prompt: question,
            difficulty: difficulty ?? 'medium',
            createdAt: session.created_at,
        });
    }
    catch (err) {
        console.error('Error generating SD prompt:', err);
        res.status(500).json({ error: 'Failed to generate prompt' });
    }
});
exports.default = router;

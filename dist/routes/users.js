"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/users.ts
const express_1 = require("express");
const users_service_1 = require("../services/users.service");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    try {
        const users = await (0, users_service_1.getAllUsers)();
        res.json(users);
    }
    catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
router.post('/', async (req, res) => {
    try {
        const { email, name } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'email is required' });
        }
        const user = await (0, users_service_1.createUser)(email, name);
        res.status(201).json(user);
    }
    catch (err) {
        console.error('Error creating user:', err);
        if (err.message === 'USER_EXISTS') {
            return res.status(409).json({ error: 'User with this email already exists' });
        }
        res.status(500).json({ error: 'Failed to create user' });
    }
});
exports.default = router;

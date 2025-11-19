// src/routes/users.ts
import { Router } from 'express';
import * as usersService from '../services/users.service';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const users = await usersService.getAllUsers();
    res.json(users);
  } catch (err) {
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

    const user = await usersService.createUser(email, name);
    res.status(201).json(user);
  } catch (err: any) {
    console.error('Error creating user:', err);
    if (err.message === 'USER_EXISTS') {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.get("/:email/system-design-stats", async (req, res) => {
  try {
    const email = req.params.email;

    const stats = await usersService.getSystemDesignStatsForUserEmail(email);

    return res.json(stats);
  } catch (err: any) {
    if (err.message === "USER_NOT_FOUND") {
      return res.status(404).json({ error: "User not found" });
    }

    console.error("Error in GET /users/:email/system-design-stats:", err);
    return res.status(500).json({
      error: "Failed to fetch system design stats for user",
      details:
        process.env.NODE_ENV === "development"
          ? err.message ?? String(err)
          : undefined,
    });
  }
});

export default router;
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

export default router;
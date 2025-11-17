// src/routes/system-design.ts (or sd.ts)
import { Router } from 'express';
import * as systemDesignService from '../services/system-design.service';
import { findUserByEmail } from '../services/users.service';

const router = Router();

// Create session by email
router.post('/by-email', async (req, res) => {
  try {
    const { email, prompt } = req.body;

    if (!email || !prompt) {
      return res.status(400).json({ error: 'email and prompt are required' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'No user found with this email' });
    }

    const session = await systemDesignService.createSystemDesignSession(user.id, prompt);
    res.status(201).json(session);
  } catch (err) {
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
      const { email, difficulty } = req.body as {
        email?: string;
        difficulty?: 'easy' | 'medium' | 'hard';
      };
  
      if (!email) {
        return res.status(400).json({ error: 'email is required' });
      }
  
      const user = await findUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'No user found with this email' });
      }
  
      const { session, question } = await systemDesignService.createAISystemDesignSessionForUser(
        user.id,
        difficulty ?? 'medium'
      );
  
      res.status(201).json({
        sessionId: session.id,
        userId: session.user_id,
        prompt: question,
        difficulty: difficulty ?? 'medium',
        createdAt: session.created_at,
      });
    } catch (err) {
      console.error('Error generating SD prompt:', err);
      res.status(500).json({ error: 'Failed to generate prompt' });
    }
});


router.post('/submit-answer', async (req, res) => {
  try {
    const { sessionId, answer } = req.body as {
      sessionId?: string;
      answer?: string;
    };

    if (!sessionId || !answer) {
      return res
        .status(400)
        .json({ error: 'sessionId and answer are required' });
    }

    const result = await systemDesignService.submitSystemDesignAnswer(sessionId, answer);

    res.status(200).json({
      sessionId: result.session.id,
      score: result.evaluation.score,
      strengths: result.evaluation.strengths,
      weaknesses: result.evaluation.weaknesses,
      updatedAt: result.session.updated_at,
    });
  } catch (err: any) {
    console.error('Error submitting SD answer:', err);
    if (err.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'Session not found' });
    }
    return res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// src/routes/system-design.ts
router.get('/session/:id', async (req, res) => {
  try {
    const session = await systemDesignService.getSessionById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // If strengths/weaknesses are stored as JSON strings:
    let strengths: string[] = [];
    let weaknesses: string[] = [];

    try {
      strengths = session.strengths ? JSON.parse(session.strengths as any) : [];
    } catch {}
    try {
      weaknesses = session.weaknesses ? JSON.parse(session.weaknesses as any) : [];
    } catch {}

    res.json({
      id: session.id,
      userId: session.user_id,
      prompt: session.prompt,
      answer: session.answer,
      score: session.score,
      strengths,
      weaknesses,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    });
  } catch (err) {
    console.error('Error fetching SD session:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

router.get('/user/:id/stats', async (req, res) => {
  try {
    const userId = req.params.id;

    const stats = await systemDesignService.getUserStats(userId);
    if (!stats) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(stats);
  } catch (err) {
    console.error('Error fetching user stats:', err);
    return res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

export default router;
import { Router, Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth.js';
import { authenticateUser, issueAccessToken } from '../services/authService.js';

const router = Router();

router.post('/login', (req: Request, res: Response) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required',
    });
  }

  const user = authenticateUser(username, password);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid username or password',
    });
  }

  const token = issueAccessToken(user);
  return res.json({
    success: true,
    token,
    user,
  });
});

router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).authUser;
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  return res.json({
    success: true,
    user,
  });
});

router.post('/logout', requireAuth, (_req: Request, res: Response) => {
  // Stateless token auth: client logout just drops token locally.
  return res.json({ success: true });
});

export default router;

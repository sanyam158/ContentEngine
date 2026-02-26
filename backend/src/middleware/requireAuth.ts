import { NextFunction, Request, Response } from 'express';
import { PublicAuthUser, verifyAccessToken } from '../services/authService.js';

export interface AuthenticatedRequest extends Request {
  authUser?: PublicAuthUser;
}

const extractBearerToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token.trim();
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
  }

  const authUser = verifyAccessToken(token);
  if (!authUser) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired session token',
    });
  }

  const authenticatedReq = req as AuthenticatedRequest;
  authenticatedReq.authUser = authUser;

  // Preserve existing user-id dependent flows by attaching the authenticated id.
  req.headers['x-user-id'] = authUser.id;

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    (req.body as Record<string, unknown>).userId = authUser.id;
  }

  return next();
};

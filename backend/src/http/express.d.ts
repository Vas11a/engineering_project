import type { AuthenticatedUser } from '../auth/types.js';

declare global {
  namespace Express {
    interface Request {
      currentUser?: AuthenticatedUser;
    }
  }
}

export {};

import type { RequestHandler } from 'express';

import type { TelegramProfile } from '../../auth/types.js';
import { HttpError } from '../errors.js';
import type { AppStore } from '../../store/types.js';

type AuthenticationOptions = {
  store: AppStore;
  verifyInitData: (rawInitData: string) => TelegramProfile;
  developmentProfile?: TelegramProfile;
};

export function createAuthenticationMiddleware({
  store,
  verifyInitData,
  developmentProfile,
}: AuthenticationOptions): RequestHandler {
  return async (request, _response, next) => {
    try {
      const authorization = request.header('authorization');
      let profile: TelegramProfile;

      if (authorization?.startsWith('tma ')) {
        const rawInitData = authorization.slice(4).trim();
        if (!rawInitData) {
          throw new HttpError(
            401,
            'UNAUTHORIZED',
            'Authentication is required.',
          );
        }
        try {
          profile = verifyInitData(rawInitData);
        } catch {
          throw new HttpError(
            401,
            'UNAUTHORIZED',
            'Invalid Telegram authentication data.',
          );
        }
      } else if (developmentProfile) {
        profile = developmentProfile;
      } else {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication is required.');
      }

      request.currentUser = await store.upsertUser(profile);
      next();
    } catch (error) {
      next(error);
    }
  };
}

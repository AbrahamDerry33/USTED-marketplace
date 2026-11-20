import { vi } from 'vitest';
import type { NextFunction, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { AuthRequest } from '../../middleware/auth';

export function createMockDecodedIdToken(
  overrides: Partial<DecodedIdToken> = {}
): DecodedIdToken {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    aud: 'infinite-mercury-wbcxw',
    auth_time: nowSeconds - 60,
    exp: nowSeconds + 3600,
    firebase: {
      identities: { email: ['kwame@st.ug.edu.gh'] },
      sign_in_provider: 'google.com',
    },
    iat: nowSeconds - 60,
    iss: 'https://securetoken.google.com/infinite-mercury-wbcxw',
    sub: 'student-uid-1',
    uid: 'student-uid-1',
    email: 'kwame@st.ug.edu.gh',
    email_verified: true,
    ...overrides,
  };
}

export function createMockExpressAuthContext(authorizationHeader?: string) {
  const req = {
    headers: authorizationHeader !== undefined ? { authorization: authorizationHeader } : {},
  } as AuthRequest;

  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = {
    status,
    json,
  } as unknown as Response;

  const next = vi.fn() as unknown as NextFunction;

  return { req, res, next, status, json };
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatFirestoreAllowedDomainsList,
  getConfiguredSchoolDomains,
} from '../../config/marketplace';
import {
  isAcademicStudentEmail,
  isAllowedSchoolEmail,
  isValidEmailAddress,
} from '../../lib/listingValidation';

vi.mock('../../lib/firebase-admin.ts', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
}));

vi.mock('../../db/repository.ts', () => ({
  getOrCreateUser: vi.fn(),
}));

import { getOrCreateUser } from '../../db/repository.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { requireAuth, verifyVerifiedStudentToken } from '../../middleware/auth.ts';
import { createMockDecodedIdToken, createMockExpressAuthContext } from '../fixtures/auth';

const mockedVerifyIdToken = vi.mocked(adminAuth.verifyIdToken);
const mockedGetOrCreateUser = vi.mocked(getOrCreateUser);

describe('Authentication Business Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('open email registration & optional Verified Student badge policy', () => {
    it('accepts any standard valid email address across consumer and academic providers', () => {
      expect(isValidEmailAddress('ama@gmail.com')).toBe(true);
      expect(isValidEmailAddress('kofi.mensah@yahoo.com')).toBe(true);
      expect(isValidEmailAddress('esi.owusu@outlook.com')).toBe(true);
      expect(isValidEmailAddress('Kwame.Mensah@st.ug.edu.gh')).toBe(true);
      expect(isValidEmailAddress('researcher@mit.edu')).toBe(true);

      // Compatibility alias also accepts standard valid emails regardless of domain list
      expect(isAllowedSchoolEmail('ama@gmail.com', ['st.ug.edu.gh'])).toBe(true);
      expect(isAllowedSchoolEmail('kofi@yahoo.com', [])).toBe(true);

      // Invalid formats are still rejected
      expect(isValidEmailAddress('not-an-email')).toBe(false);
      expect(isValidEmailAddress('@st.ug.edu.gh')).toBe(false);
      expect(isValidEmailAddress('student@localhost')).toBe(false);
      expect(isValidEmailAddress('bad..dots@gmail.com')).toBe(false);
      expect(isValidEmailAddress('bad email@gmail.com')).toBe(false);
    });

    it('awards optional Verified Student badge only to recognized academic domains', () => {
      // Ghanaian & international academic domains
      expect(isAcademicStudentEmail('kwame@st.ug.edu.gh')).toBe(true);
      expect(isAcademicStudentEmail('ama@UG.EDU.GH')).toBe(true);
      expect(isAcademicStudentEmail('kofi@st.knust.edu.gh')).toBe(true);
      expect(isAcademicStudentEmail('esi@stu.ucc.edu.gh')).toBe(true);
      expect(isAcademicStudentEmail('yaw@uew.edu.gh')).toBe(true);
      expect(isAcademicStudentEmail('adwoa@ashesi.edu.gh')).toBe(true);
      expect(isAcademicStudentEmail('fellow@stanford.edu')).toBe(true);

      // Standard consumer emails do NOT receive the badge (non-blocking)
      expect(isAcademicStudentEmail('ama@gmail.com')).toBe(false);
      expect(isAcademicStudentEmail('kofi@yahoo.com')).toBe(false);
      expect(isAcademicStudentEmail('esi@outlook.com')).toBe(false);
      expect(isAcademicStudentEmail('spoof@edu.com')).toBe(false);
      expect(isAcademicStudentEmail(null)).toBe(false);

      // Optional extra configured domains can extend badge recognition
      expect(isAcademicStudentEmail('student@campus-partner.ac.gh', ['campus-partner.ac.gh'])).toBe(
        true
      );
    });

    it('parses comma-separated VITE_SCHOOL_EMAIL_DOMAINS cleanly', () => {
      vi.stubEnv('VITE_SCHOOL_EMAIL_DOMAINS', ' @st.ug.edu.gh , ug.edu.gh , , KNUST.EDU.GH ');
      expect(getConfiguredSchoolDomains()).toEqual([
        'st.ug.edu.gh',
        'ug.edu.gh',
        'knust.edu.gh',
      ]);

      vi.stubEnv('VITE_SCHOOL_EMAIL_DOMAINS', '');
      expect(getConfiguredSchoolDomains()).toEqual([]);
    });

    it('formats normalized academic domains for rules helpers', () => {
      expect(
        formatFirestoreAllowedDomainsList([' @ST.UG.EDU.GH ', 'ug.edu.gh', 'st.ug.edu.gh', 'bad'])
      ).toBe("['st.ug.edu.gh', 'ug.edu.gh']");
      expect(formatFirestoreAllowedDomainsList([])).toBe('[]');
    });
  });

  describe('verifyVerifiedStudentToken', () => {
    it('verifies token, enforces email_verified, and resolves the database user record for any verified email', async () => {
      const decoded = createMockDecodedIdToken({
        uid: 'uid-verified-1',
        email: 'ama@gmail.com',
        email_verified: true,
      });
      const dbUser = {
        id: 42,
        uid: 'uid-verified-1',
        email: 'ama@gmail.com',
        createdAt: new Date('2026-11-17T10:00:00Z'),
      };

      mockedVerifyIdToken.mockResolvedValueOnce(decoded);
      mockedGetOrCreateUser.mockResolvedValueOnce(dbUser);

      const result = await verifyVerifiedStudentToken('valid-jwt-token');

      expect(mockedVerifyIdToken).toHaveBeenCalledWith('valid-jwt-token');
      expect(mockedGetOrCreateUser).toHaveBeenCalledWith('uid-verified-1', 'ama@gmail.com');
      expect(result).toEqual({ decodedToken: decoded, dbUser });
    });

    it('rejects authenticated users whose email is not verified', async () => {
      mockedVerifyIdToken.mockResolvedValueOnce(
        createMockDecodedIdToken({ email: 'ama@gmail.com', email_verified: false })
      );

      await expect(verifyVerifiedStudentToken('unverified-token')).rejects.toThrow(
        'Verified email is required.'
      );
      expect(mockedGetOrCreateUser).not.toHaveBeenCalled();
    });
  });

  describe('requireAuth Express middleware', () => {
    it('returns 401 when Authorization header is missing, non-Bearer, or empty', async () => {
      for (const header of [undefined, 'Basic abc123', 'Bearer    ']) {
        const { req, res, next, status, json } = createMockExpressAuthContext(header);
        await requireAuth(req, res, next);
        expect(status).toHaveBeenCalledWith(401);
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.stringMatching(/Unauthorized/i) })
        );
        expect(next).not.toHaveBeenCalled();
      }
      expect(mockedVerifyIdToken).not.toHaveBeenCalled();
    });

    it('returns 403 when token belongs to an unverified account', async () => {
      mockedVerifyIdToken.mockResolvedValueOnce(
        createMockDecodedIdToken({ email_verified: false })
      );

      const { req, res, next, status, json } = createMockExpressAuthContext('Bearer token-123');
      await requireAuth(req, res, next);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: 'Verified email is required.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Firebase ID token verification fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockedVerifyIdToken.mockRejectedValueOnce(new Error('Firebase ID token has expired.'));

      const { req, res, next, status, json } = createMockExpressAuthContext('Bearer expired-token');
      await requireAuth(req, res, next);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized: Invalid or expired token.' });
      expect(next).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('returns 500 when user profile persistence fails unexpectedly', async () => {
      mockedVerifyIdToken.mockResolvedValueOnce(createMockDecodedIdToken());
      mockedGetOrCreateUser.mockRejectedValueOnce(
        new Error('Unable to load user profile from database.')
      );

      const { req, res, next, status, json } = createMockExpressAuthContext('Bearer valid-token');
      await requireAuth(req, res, next);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        error: 'Unable to load user profile from database.',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('attaches req.user and req.dbUser and invokes next() on valid verified Bearer tokens', async () => {
      const decoded = createMockDecodedIdToken({ uid: 'uid-99', email: 'kofi@yahoo.com' });
      const dbUser = {
        id: 7,
        uid: 'uid-99',
        email: 'kofi@yahoo.com',
        createdAt: new Date('2026-11-17T10:00:00Z'),
      };

      mockedVerifyIdToken.mockResolvedValueOnce(decoded);
      mockedGetOrCreateUser.mockResolvedValueOnce(dbUser);

      const { req, res, next, status } = createMockExpressAuthContext('Bearer good-token');
      await requireAuth(req, res, next);

      expect(status).not.toHaveBeenCalled();
      expect(req.user).toEqual(decoded);
      expect(req.dbUser).toEqual(dbUser);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});

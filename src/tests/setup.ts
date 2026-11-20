import { afterEach, vi } from 'vitest';

/**
 * Shared Vitest setup for Campus Market test suites.
 * Ensures mocks, spies, and stubbed environment variables are reset after each test.
 */
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

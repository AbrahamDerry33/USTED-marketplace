import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    include: [
      'src/tests/**/*.test.{ts,tsx}',
      'src/**/*.test.{ts,tsx}',
      'tests/**/*.test.ts',
    ],
    clearMocks: true,
    restoreMocks: true,
  },
});

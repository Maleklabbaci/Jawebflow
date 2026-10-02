import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Tests unitaires et d'intégration (sans réseau : Meta et Supabase sont simulés).
//   npm test            → tout lancer une fois
//   npm run test:watch  → relancer à chaque modification
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node', // les tests d'interface activent jsdom avec « // @vitest-environment jsdom »
    testTimeout: 15000,
  },
});

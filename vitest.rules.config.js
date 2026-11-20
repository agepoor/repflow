import { defineConfig } from 'vitest/config';

// Database rules tests need the emulator: run them with `npm run test:rules`, not `npm test`
export default defineConfig({
  test: { include: ['test/rules/**/*.test.js'], fileParallelism: false },
});

import { defineConfig } from 'vitest/config';

// Dates and parts of the day are local time: pin a zone so results don't depend on the machine (test workers inherit it)
process.env.TZ = 'Europe/Amsterdam';

export default defineConfig({
  // test/rules/ needs the database emulator (`npm run test:rules`), test/e2e/ a browser (`npm run test:e2e`)
  test: { include: ['test/**/*.test.js'], exclude: ['test/rules/**', 'test/e2e/**', 'node_modules/**'] },
});

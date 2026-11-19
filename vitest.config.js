import { defineConfig } from 'vitest/config';

// Dates and parts of the day are local time: pin a zone so results don't depend on the machine (test workers inherit it)
process.env.TZ = 'Europe/Amsterdam';

export default defineConfig({
  test: { include: ['test/**/*.test.js'] },
});

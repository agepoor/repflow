import { defineConfig } from '@playwright/test';

// The README screenshots (`npm run screenshots`): docs/screenshots/take.js opens the built site with the demo routines and
// saves each screen to docs/screenshots/. Not a test, so it has its own config and port, and `npm run test:e2e` skips it.
const PORT = 4174;

export default defineConfig({
  testDir: 'docs/screenshots',
  testMatch: 'take.js',
  reporter: 'list',
  // Dates and parts of the day are local time, and times follow the browser's clock format: pin both (24-hour)
  use: { baseURL: `http://127.0.0.1:${PORT}/`, locale: 'en-GB', timezoneId: 'Europe/Amsterdam' },
  webServer: {
    command: `bash build.sh _site && python3 -m http.server ${PORT} --bind 127.0.0.1 -d _site 2>/dev/null`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
  },
});

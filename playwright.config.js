import { defineConfig, devices } from '@playwright/test';

// Browser test against the built site (`npm run test:e2e`), at phone size because most people use PunchPace on Android.
// It builds `_site` and serves it on its own port, so a dev server on 8000 with an older build is never tested by mistake.
// The server's request log is dropped; build errors still show.
const PORT = 4173;

export default defineConfig({
  testDir: 'test/e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}/`, trace: 'retain-on-failure' },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `bash build.sh _site && python3 -m http.server ${PORT} --bind 127.0.0.1 -d _site 2>/dev/null`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
  },
});

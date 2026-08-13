import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: true
      },
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'android-chrome', use: { ...devices['Pixel 7'] } }
  ]
});

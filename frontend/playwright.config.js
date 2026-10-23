import { defineConfig, devices } from '@playwright/test';

// E2E runs against a full stack (docker compose up). BASE_URL defaults to the local gateway with its dev certificate.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: process.env.BASE_URL ?? 'https://localhost', ignoreHTTPSErrors: true, trace: 'retain-on-failure', permissions: ['geolocation'], geolocation: { latitude: 23.8762, longitude: 90.3205 } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});

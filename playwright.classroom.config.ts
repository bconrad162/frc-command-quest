import { defineConfig, devices } from '@playwright/test'

// Classroom-mode E2E: the app built against a Supabase stack (normally `npx supabase start`).
// Run with: npm run test:e2e:classroom
const PORT = 4174
export default defineConfig({
  testDir: 'tests/e2e-classroom',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}/frc-command-quest/`, viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx vite build --outDir dist-classroom && npx vite preview --outDir dist-classroom --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/frc-command-quest/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: process.env.SUPABASE_TEST_URL ?? '',
      VITE_SUPABASE_ANON_KEY: process.env.SUPABASE_TEST_ANON_KEY ?? '',
    },
  },
})

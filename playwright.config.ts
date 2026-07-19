import { defineConfig, devices } from '@playwright/test'
import { execSync } from 'node:child_process'

// Point the app at the LOCAL Supabase stack — never production.
function localSupabaseEnv() {
  const out = execSync('supabase status -o env', { encoding: 'utf8' })
  const get = (k: string) => out.match(new RegExp(`^${k}="?([^"\\n]+)"?$`, 'm'))?.[1]
  const url = get('API_URL') ?? 'http://127.0.0.1:54321'
  const anon = get('ANON_KEY')
  if (!anon) throw new Error('Local Supabase not running — run `supabase start` first')
  return { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anon }
}

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    env: { ...process.env, ...localSupabaseEnv() },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
})

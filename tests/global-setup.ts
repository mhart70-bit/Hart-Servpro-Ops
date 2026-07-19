import { execSync } from 'node:child_process'

// Reseed the local stack before every suite run so tests start from a known
// state regardless of what previous runs mutated.
export default function globalSetup() {
  const out = execSync('supabase status -o env', { encoding: 'utf8' })
  const serviceKey = out.match(/^SERVICE_ROLE_KEY="?([^"\n]+)"?$/m)?.[1]
  if (!serviceKey) throw new Error('Local Supabase not running — run `supabase start` first')
  execSync('node tests/seed.mjs', {
    stdio: 'inherit',
    env: { ...process.env, SUPABASE_URL: 'http://127.0.0.1:54321', SERVICE_ROLE_KEY: serviceKey },
  })
}

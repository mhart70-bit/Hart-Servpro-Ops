#!/bin/bash
# ============================================================
# Hart Sales OS — one-shot production security deployment
# Double-click this file (or run it in Terminal). It walks through:
#   1. Supabase login (browser, one time)
#   2. Deploy the parse-note edge function + set the Anthropic key secret
#   3. Apply the security migrations (copies SQL to clipboard, opens SQL editor)
#   4. Push to GitHub → Vercel auto-deploys the fixed app
# Safe to re-run at any point — every step checks before acting.
# After you rotate the Anthropic key later: update supabase/functions/.env
# and re-run this script; it will update the production secret.
# ============================================================
set -e
cd "$(dirname "$0")"

PROJECT_REF="vnzgwhvdhyizrdevvkne"
bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }

bold "Step 0 — sanity checks"
if ! grep -q '^ANTHROPIC_API_KEY=sk-ant-' supabase/functions/.env 2>/dev/null; then
  echo "❌ supabase/functions/.env is missing ANTHROPIC_API_KEY=sk-ant-…"
  echo "   Put the (new or current) key in that file first, then re-run."
  exit 1
fi
echo "✓ Anthropic key present in supabase/functions/.env"

bold "Step 1 — Supabase login"
if supabase projects list >/dev/null 2>&1; then
  echo "✓ Already logged in"
else
  echo "A browser window will open — approve the login."
  supabase login
fi

bold "Step 2 — Link this repo to the production project"
if supabase status >/dev/null 2>&1 && [ -f supabase/.temp/project-ref ] && grep -q "$PROJECT_REF" supabase/.temp/project-ref 2>/dev/null; then
  echo "✓ Already linked"
else
  supabase link --project-ref "$PROJECT_REF"
fi

bold "Step 3 — Set the server-side Anthropic key + deploy the parse-note function"
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy parse-note
echo "✓ Voice-note parsing now runs server-side in production"

bold "Step 4 — Apply security migrations (SQL editor)"
cat supabase/migrations/003_explicit_grants.sql supabase/migrations/004_security_fixes.sql | pbcopy
echo "The combined SQL for migrations 003 + 004 is on your clipboard."
echo "The SQL editor is opening — paste (Cmd+V) and click Run. Both are safe to re-run."
open "https://supabase.com/dashboard/project/$PROJECT_REF/sql/new"
read -r -p "Press Enter here once the SQL has run successfully… "

bold "Step 5 — Push to GitHub (Vercel auto-deploys)"
git push origin main
echo "✓ Pushed. Vercel will build the new bundle (no API key inside it)."

bold "All done 🎉"
echo "Remaining hygiene (optional, anytime):"
echo "  • Rotate the Anthropic key at console.anthropic.com if you haven't yet,"
echo "    then update supabase/functions/.env and re-run this script."
echo "  • Remove VITE_ANTHROPIC_API_KEY from Vercel env vars (Settings → Environment"
echo "    Variables) — the new code never reads it, this is just cleanup."

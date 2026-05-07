#!/bin/bash
# ============================================================
# Hart SERVPRO CRM — One-Shot Setup Script
# Run this once: ./setup.sh
# ============================================================
set -e

SUPABASE_CLI="/opt/homebrew/Cellar/supabase-beta/2.99.0-beta.2/bin/supabase"
PROJECT_ID="vnzgwhvdhyizrdevvkne"
PROJECT_URL="https://${PROJECT_ID}.supabase.co"

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║       Hart SERVPRO CRM — Setup Wizard         ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# ──────────────────────────────────────────
# STEP 1: Get Supabase credentials
# ──────────────────────────────────────────
echo "STEP 1 of 4: Supabase Credentials"
echo "───────────────────────────────────"
echo "Open: https://supabase.com/dashboard/project/${PROJECT_ID}/settings/api"
echo "Copy your 'anon public' key, then paste it below."
echo ""
read -p "Paste your Supabase anon key: " SUPABASE_ANON_KEY

if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "❌ No key provided. Exiting."
  exit 1
fi

# ──────────────────────────────────────────
# STEP 2: Get Anthropic API key
# ──────────────────────────────────────────
echo ""
echo "STEP 2 of 4: Anthropic API Key"
echo "───────────────────────────────"
echo "Open: https://console.anthropic.com/settings/keys"
echo "Create a key or copy an existing one."
echo ""
read -p "Paste your Anthropic API key (sk-ant-...): " ANTHROPIC_KEY

if [ -z "$ANTHROPIC_KEY" ]; then
  echo "❌ No key provided. Exiting."
  exit 1
fi

# ──────────────────────────────────────────
# Write .env file
# ──────────────────────────────────────────
cat > .env << ENVEOF
VITE_SUPABASE_URL=${PROJECT_URL}
VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
VITE_ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
ENVEOF

echo "✅ .env file written"

# ──────────────────────────────────────────
# STEP 3: Run Supabase migration
# ──────────────────────────────────────────
echo ""
echo "STEP 3 of 4: Database Migration"
echo "───────────────────────────────"
echo "Open: https://supabase.com/dashboard/project/${PROJECT_ID}/sql/new"
echo ""
echo "Then copy and paste the contents of:"
echo "  supabase/migrations/001_initial_schema.sql"
echo ""
echo "Click 'Run' to create all tables, policies, and seed data."
echo ""
read -p "Press Enter after you've run the migration... "

# ──────────────────────────────────────────
# STEP 4: Push to GitHub and deploy
# ──────────────────────────────────────────
echo ""
echo "STEP 4 of 4: Push to GitHub + Deploy"
echo "──────────────────────────────────────"

# Push to GitHub
echo "Pushing to GitHub..."
if git push origin main 2>/dev/null; then
  echo "✅ Code pushed to GitHub"
else
  echo "⚠️  GitHub push failed — may need to authenticate first."
  echo "Run: gh auth login"
fi

# Check for Vercel CLI
if command -v vercel &> /dev/null; then
  echo ""
  echo "Deploying to Vercel..."
  vercel --prod --yes \
    -e VITE_SUPABASE_URL="$PROJECT_URL" \
    -e VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
    -e VITE_ANTHROPIC_API_KEY="$ANTHROPIC_KEY"
else
  echo ""
  echo "To deploy to Vercel:"
  echo "  npm install -g vercel"
  echo "  vercel --prod"
  echo ""
  echo "When prompted, add these environment variables:"
  echo "  VITE_SUPABASE_URL     = $PROJECT_URL"
  echo "  VITE_SUPABASE_ANON_KEY = (from your .env)"
  echo "  VITE_ANTHROPIC_API_KEY = (from your .env)"
fi

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║  Setup complete! Your CRM is ready.            ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""
echo "Next: Create your owner account in Supabase:"
echo "  https://supabase.com/dashboard/project/${PROJECT_ID}/auth/users"
echo "  → Invite user → your email → after signup, set role='owner' in profiles table"
echo ""

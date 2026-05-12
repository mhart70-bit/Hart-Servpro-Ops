#!/bin/bash
cd "$(dirname "$0")"
echo "=== Pushing to GitHub ==="
git push origin main
echo ""
echo "=== Deploying to Vercel ==="
vercel --prod
echo ""
echo "=== Done ==="

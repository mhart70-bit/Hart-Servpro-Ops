#!/bin/bash
cd ~/Documents/Hart-Servpro-Ops

# Clear any stale git locks
rm -f .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock 2>/dev/null

# Stage and push all changes
git add -A
git commit -m "feat: contact detail, ERP pipeline, route color coding, accountability metrics, SMS/geo architecture"
git push origin main

echo ""
echo "✅ Done! Vercel is deploying now."
echo "   Visit: https://hart-servpro-ops.vercel.app in ~60 seconds"
echo ""
read -p "Press Enter to close..."

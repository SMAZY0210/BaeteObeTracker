#!/usr/bin/env bash
# Bootstrapping baete-obe from the ObeTracker codebase.
# Run from the directory where you want the new repo to live.
set -euo pipefail

REPO_NAME="${1:-baete-obe}"

echo "==> Cloning ObeTracker as the starting point"
git clone https://github.com/SMAZY0210/ObeTracker.git "$REPO_NAME"
cd "$REPO_NAME"

echo "==> Cutting history ties to the old repo"
rm -rf .git
git init -b main
git remote add origin "git@github.com:SMAZY0210/${REPO_NAME}.git"

echo "==> Preserving the original attainment engine for reference"
mkdir -p docs/legacy
cp obe-tracker-backend/src/utils/attainment.js docs/legacy/attainment.legacy.js
cp obe-tracker-backend/prisma/seed.js           docs/legacy/seed.legacy.js
cp obe-tracker-backend/prisma/schema.prisma     docs/legacy/schema.legacy.prisma

echo "==> Removing the duplicated root schema (it was byte-identical to prisma/)"
rm -f obe-tracker-backend/schema.prisma

echo "==> Clearing stale migrations; the new schema is not a delta on the old one"
rm -rf obe-tracker-backend/prisma/migrations

echo "==> Removing the credentials table from the public README"
if grep -q "Credentials" README.md 2>/dev/null; then
  echo "    !! README.md still lists admin/faculty passwords. Edit it before pushing."
fi

echo
echo "Now copy in the new files:"
echo "  prisma/schema.prisma            -> obe-tracker-backend/prisma/schema.prisma"
echo "  prisma/baete-v3-framework.js    -> obe-tracker-backend/prisma/"
echo "  prisma/seed-framework.js        -> obe-tracker-backend/prisma/"
echo "  src/utils/attainment.js         -> obe-tracker-backend/src/utils/attainment.js"
echo "  src/services/policy.service.js  -> obe-tracker-backend/src/services/"
echo "  src/services/attainment.service.js -> obe-tracker-backend/src/services/"
echo "  MIGRATION.md                    -> repo root"
echo
echo "Then: cd obe-tracker-backend && npm install && npx prisma migrate dev --name baete_v3_init"

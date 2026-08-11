#!/usr/bin/env bash
#
# db-sync.sh
# Reads an env file, exports DATABASE_URL and DIRECT_URL from it, pushes
# schema.prisma to that database and runs prisma/seed.js against it.
#
# Exists because prisma/seed.js never calls dotenv (only src/app.js does), so
# `npm run db:seed` on its own picks up nothing and dies on a missing env var.
#
# Put it in obe-tracker-backend/scripts/db-sync.sh and chmod +x it.
#
#   ./scripts/db-sync.sh                      # uses .env
#   ./scripts/db-sync.sh -p                   # pulls prod env from Vercel first
#   ./scripts/db-sync.sh -f .env.production   # any other file
#   ./scripts/db-sync.sh -n                   # dry run, prints and stops
#   ./scripts/db-sync.sh --seed-only          # skip the schema push
#
set -euo pipefail

ENV_FILE=".env"
DO_PULL=0
DRY_RUN=0
ASSUME_YES=0
SKIP_PUSH=0
SKIP_SEED=0
DATA_LOSS=0

while [ $# -gt 0 ]; do
  case "$1" in
    -f|--file)          ENV_FILE="$2"; shift 2 ;;
    -p|--pull)          DO_PULL=1; shift ;;
    -n|--dry-run)       DRY_RUN=1; shift ;;
    -y|--yes)           ASSUME_YES=1; shift ;;
    --seed-only)        SKIP_PUSH=1; shift ;;
    --push-only)        SKIP_SEED=1; shift ;;
    --accept-data-loss) DATA_LOSS=1; shift ;;
    -h|--help)          sed -n '3,18p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

# Run from the backend root whatever directory you invoked this from.
cd "$(cd "$(dirname "$0")/.." && pwd)"

say()  { printf '%s\n' "$*"; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }
mask() { printf '%s' "$1" | sed -E 's#://([^:/@]+):[^@]*@#://\1:****@#'; }

# ── Pull the hosted values ──────────────────────────────────────
# `vercel env pull` writes the deployed Production variables to a local file.
# Link the directory once with `vercel link` before this works.
if [ "$DO_PULL" -eq 1 ]; then
  command -v vercel >/dev/null 2>&1 || die "vercel CLI not found. npm i -g vercel"
  ENV_FILE=".env.production.local"
  say "Pulling Production env into $ENV_FILE"
  vercel env pull "$ENV_FILE" --environment=production
  grep -q '^\.env\*\?\.local' .gitignore 2>/dev/null || say "  note: add $ENV_FILE to .gitignore"
fi

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found (run with -p to pull it from Vercel)"

# ── Load it ─────────────────────────────────────────────────────
# Parsed line by line rather than sourced, so nothing in the file executes.
# Handles KEY=value, KEY="value", export KEY=value, blank lines and comments.
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|'#'*) continue ;; esac
  line="${line#export }"
  key="${line%%=*}"
  val="${line#*=}"
  case "$key" in *[!A-Za-z0-9_]*|'') continue ;; esac
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  export "$key=$val"
done < "$ENV_FILE"

[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL missing from $ENV_FILE"

# schema.prisma declares directUrl, so Prisma refuses to start without it.
# .env.example never defines it, which is where the "Environment variable not
# found: DIRECT_URL" message comes from.
if [ -z "${DIRECT_URL:-}" ]; then
  say "DIRECT_URL not set, deriving it from DATABASE_URL"
  DIRECT_URL="${DATABASE_URL%%\?*}"          # drop the query string
  DIRECT_URL="${DIRECT_URL/:6543\//:5432\/}" # pooler port to session port
  export DIRECT_URL
fi

DB_HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^@]*@##; s#[:/].*$##')"

say ""
say "  env file    $ENV_FILE"
say "  host        $DB_HOST"
say "  DATABASE_URL $(mask "$DATABASE_URL")"
say "  DIRECT_URL   $(mask "$DIRECT_URL")"
say ""

# ── Guards ──────────────────────────────────────────────────────
# db push and migrations cannot run through pgbouncer. Port 6543 is the
# transaction pooler and will fail or silently misbehave on DDL.
case "$DIRECT_URL" in
  *:6543*)   die "DIRECT_URL points at the pgbouncer pooler (6543). Use the session port 5432." ;;
  *pgbouncer=true*) die "DIRECT_URL still carries pgbouncer=true. Strip the query string." ;;
esac

REMOTE=1
case "$DB_HOST" in localhost|127.0.0.1|::1|host.docker.internal) REMOTE=0 ;; esac

if [ "$REMOTE" -eq 1 ] && [ "$ASSUME_YES" -eq 0 ] && [ "$DRY_RUN" -eq 0 ]; then
  say "$DB_HOST is not local. db push can drop columns, and the seed will"
  say "reset the admin and student passwords to the values in seed.js."
  printf 'Type the host name to continue: '
  read -r reply
  [ "$reply" = "$DB_HOST" ] || die "aborted"
  say ""
fi

if [ "$DRY_RUN" -eq 1 ]; then
  say "dry run, stopping here"
  [ "$SKIP_PUSH" -eq 0 ] && say "  would run: npx prisma db push"
  [ "$SKIP_SEED" -eq 0 ] && say "  would run: node prisma/seed.js"
  exit 0
fi

# ── Back up first on anything remote ────────────────────────────
if [ "$REMOTE" -eq 1 ] && command -v pg_dump >/dev/null 2>&1; then
  STAMP="backup-$(date +%Y%m%d-%H%M%S).sql"
  say "Dumping current data to $STAMP"
  pg_dump --data-only --inserts --no-owner "$DIRECT_URL" > "$STAMP" || \
    say "  pg_dump failed, continuing without a backup"
fi

# ── Push schema, then seed ──────────────────────────────────────
if [ "$SKIP_PUSH" -eq 0 ]; then
  say "Pushing schema.prisma"
  if [ "$DATA_LOSS" -eq 1 ]; then
    npx prisma db push --accept-data-loss
  else
    npx prisma db push
  fi
fi

if [ "$SKIP_SEED" -eq 0 ]; then
  say "Seeding"
  node prisma/seed.js
fi

# ── Verify ──────────────────────────────────────────────────────
if command -v psql >/dev/null 2>&1; then
  say ""
  say "Batches, their department and how many students sit in each:"
  psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -c \
    'SELECT s.name AS batch, COALESCE(d.code, $$(none)$$) AS dept, count(u.id) AS students
       FROM "Session" s
       LEFT JOIN "Department" d ON d.id = s."departmentId"
       LEFT JOIN "User" u ON u."sessionId" = s.id AND u."deletedAt" IS NULL
      GROUP BY 1, 2 ORDER BY 1;'
else
  say "psql not on PATH, skipping the check query"
fi

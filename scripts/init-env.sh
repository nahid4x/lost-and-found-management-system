#!/usr/bin/env bash
# Creates .env from .env.example with freshly generated random secrets. Refuses to overwrite an existing .env.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { echo ".env already exists - not overwriting." >&2; exit 1; }
cp .env.example .env
gen() { openssl rand -hex "${1:-32}"; }
for key in JWT_ACCESS_SECRET JWT_REFRESH_SECRET INTERNAL_SERVICE_TOKEN TURN_SECRET; do
  sed -i.bak "s|^${key}=.*|${key}=$(gen 32)|" .env
done
for key in MONGO_ROOT_PASSWORD MONGO_AUTH_PASSWORD MONGO_ITEMS_PASSWORD MONGO_MATCHING_PASSWORD MONGO_CLAIMS_PASSWORD MONGO_REALTIME_PASSWORD MONGO_NOTIFY_PASSWORD REDIS_PASSWORD; do
  sed -i.bak "s|^${key}=.*|${key}=$(gen 24)|" .env
done
rm -f .env.bak
chmod 600 .env
echo "Created .env with generated secrets. Now set CLOUDINARY_* (and SMTP_URL / APP_URL / CORS_ORIGINS for your domain)."

#!/bin/sh
# Runs once on first start of an empty MongoDB volume: one least-privilege user per service database.
# Each service can read/write ONLY its own database (no cross-service access).
set -eu
create_user() {
  db="$1"; user="$2"; pass="$3"
  mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin "$db" --eval "
    db.createUser({ user: '$user', pwd: '$pass', roles: [{ role: 'readWrite', db: '$db' }] })"
}
create_user findit_auth     findit_auth     "$MONGO_AUTH_PASSWORD"
create_user findit_items    findit_items    "$MONGO_ITEMS_PASSWORD"
create_user findit_matching findit_matching "$MONGO_MATCHING_PASSWORD"
create_user findit_claims   findit_claims   "$MONGO_CLAIMS_PASSWORD"
create_user findit_realtime findit_realtime "$MONGO_REALTIME_PASSWORD"
create_user findit_notify   findit_notify   "$MONGO_NOTIFY_PASSWORD"

#!/bin/sh
# Use real certificates when mounted at /certs (fullchain.pem + privkey.pem); otherwise create a
# throw-away self-signed certificate so `docker compose up` works locally. Never use that in production.
set -eu
mkdir -p /tmp/certs
if [ -f /certs/fullchain.pem ] && [ -f /certs/privkey.pem ]; then
  cp /certs/fullchain.pem /tmp/certs/fullchain.pem
  cp /certs/privkey.pem /tmp/certs/privkey.pem
  echo "gateway: using mounted TLS certificate"
else
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    -keyout /tmp/certs/privkey.pem -out /tmp/certs/fullchain.pem >/dev/null 2>&1
  echo "gateway: WARNING using a self-signed development certificate"
fi
chmod 600 /tmp/certs/privkey.pem

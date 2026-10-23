# Gateway: Nginx (unprivileged, non-root). Only this container publishes host ports.
FROM nginxinc/nginx-unprivileged:stable-alpine
USER root
RUN apk add --no-cache openssl && rm -f /etc/nginx/conf.d/default.conf
COPY templates/default.conf.template /etc/nginx/templates/default.conf.template
COPY snippets/ /etc/nginx/snippets/
COPY docker-entrypoint.d/10-tls.sh /docker-entrypoint.d/10-tls.sh
RUN chmod +x /docker-entrypoint.d/10-tls.sh && mkdir -p /tmp/certs && chown -R nginx:nginx /tmp/certs /etc/nginx/conf.d
USER nginx
ENV NGINX_ENVSUBST_FILTER=^INTERNAL_SERVICE_TOKEN$
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- --no-check-certificate https://127.0.0.1:8443/healthz || exit 1

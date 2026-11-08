import crypto from 'node:crypto';

/** Short-lived TURN credentials (coturn `use-auth-secret` scheme): username = expiry:user, credential = HMAC-SHA1. */
export function iceServers(env, userId, now = Date.now()) {
  const servers = [{ urls: env.STUN_URLS }];
  if (env.TURN_URLS && env.TURN_SECRET) {
    const expiry = Math.floor(now / 1000) + env.TURN_TTL_SECONDS;
    const username = `${expiry}:${userId}`;
    const credential = crypto.createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
    servers.push({ urls: env.TURN_URLS, username, credential });
  }
  return { iceServers: servers, ttl: env.TURN_TTL_SECONDS };
}

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'node:crypto';
import { sanitizeRequest } from './sanitize.js';
import { errorHandler, notFoundHandler, forbidden } from './errors.js';
import { makeLimiter } from './ratelimit.js';

/**
 * Hardened Express base: no X-Powered-By, helmet headers, strict CORS allow-list,
 * Origin guard on state-changing requests (CSRF defence-in-depth), body size cap,
 * Mongo-operator stripping, no-store caching, global rate limit.
 */
export function createBaseApp({ service, env, logger, redis = null, jsonLimit = '10kb', globalLimit = 300 }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use((req, res, next) => { req.id = crypto.randomUUID(); res.setHeader('X-Request-Id', req.id); next(); });
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=()');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const allowed = new Set(env.CORS_ORIGINS);
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 600,
  }));
  app.use((req, _res, next) => {
    const origin = req.headers.origin;
    const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (!safe && origin && !allowed.has(origin)) return next(forbidden('Origin not allowed'));
    next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true, service }));
  app.use(makeLimiter({ redis, windowMs: 15 * 60 * 1000, limit: globalLimit, prefix: `${service}:global` }));
  app.use(express.json({ limit: jsonLimit, strict: true }));
  app.use(sanitizeRequest);
  return {
    app,
    finish() {
      app.use(notFoundHandler);
      app.use(errorHandler(logger));
      return app;
    },
  };
}

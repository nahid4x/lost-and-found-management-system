import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import { loadEnv, secret } from '@findit/shared/env';
import { createLogger } from '@findit/shared/logger';
import { createMemoryBus } from '@findit/shared/events';
import { mongoose, connectMongo } from '@findit/shared/db';
import { createAuthApp } from '../src/app.js';
import { User } from '../src/models.js';

const env = loadEnv({ MONGO_URL: z.string().default('mongodb://127.0.0.1:27017/findit_test_avatars'), JWT_REFRESH_SECRET: secret, BCRYPT_COST: z.coerce.number().default(4) });
const logger = createLogger('t', process.env.TEST_LOG ?? 'silent');
let app;
const pw = 'Tr1cky-Horse-Battery';

beforeAll(async () => { await connectMongo(env.MONGO_URL, logger, { autoIndex: true }); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init().catch(() => {})));
  app = createAuthApp({ env, logger, bus: createMemoryBus() });
});

const signUp = async (name, email) => {
  const r = await request(app).post('/register').send({ name, email, password: pw });
  return { token: r.body.accessToken, id: r.body.user.id };
};

describe('GET /avatars (pictures for the chat list)', () => {
  it('needs a signed-in user', async () => {
    const r = await request(app).get('/avatars?ids=' + 'a'.repeat(24));
    expect(r.status).toBe(401);
  });

  it('returns the versioned url only for people who have a picture, and follows a change', async () => {
    const a = await signUp('Has Picture', 'a@example.com');
    const b = await signUp('No Picture', 'b@example.com');
    const viewer = await signUp('Viewer', 'v@example.com');
    await User.updateOne({ _id: a.id }, { $set: { avatarUrl: `/api/auth/avatar/${a.id}?v=1` } });

    const first = await request(app).get(`/avatars?ids=${a.id},${b.id}`).set('Authorization', `Bearer ${viewer.token}`);
    expect(first.status).toBe(200);
    expect(first.body.avatars).toEqual({ [a.id]: `/api/auth/avatar/${a.id}?v=1` });
    expect(first.headers['cache-control']).toMatch(/no-store/);

    await User.updateOne({ _id: a.id }, { $set: { avatarUrl: `/api/auth/avatar/${a.id}?v=2` } });
    const second = await request(app).get(`/avatars?ids=${a.id}`).set('Authorization', `Bearer ${viewer.token}`);
    expect(second.body.avatars[a.id]).toMatch(/v=2$/);

    await User.updateOne({ _id: a.id }, { $set: { avatarUrl: '' } });
    const gone = await request(app).get(`/avatars?ids=${a.id}`).set('Authorization', `Bearer ${viewer.token}`);
    expect(gone.body.avatars).toEqual({});
  });

  it('rejects bad ids, operators and too many ids', async () => {
    const viewer = await signUp('Viewer', 'v@example.com');
    const H = { Authorization: `Bearer ${viewer.token}` };
    expect((await request(app).get('/avatars?ids=nope').set(H)).status).toBe(400);
    expect((await request(app).get('/avatars').set(H)).status).toBe(400);
    expect((await request(app).get('/avatars?ids[$ne]=x').set(H)).status).toBe(400);
    const many = Array.from({ length: 51 }, (_, i) => String(i).padStart(24, '0')).join(',');
    expect((await request(app).get(`/avatars?ids=${many}`).set(H)).status).toBe(400);
  });

  it('does not reveal pictures of deactivated accounts', async () => {
    const a = await signUp('Gone', 'g@example.com');
    const viewer = await signUp('Viewer', 'v@example.com');
    await User.updateOne({ _id: a.id }, { $set: { avatarUrl: `/api/auth/avatar/${a.id}?v=1`, isActive: false } });
    const r = await request(app).get(`/avatars?ids=${a.id}`).set('Authorization', `Bearer ${viewer.token}`);
    expect(r.body.avatars).toEqual({});
  });
});

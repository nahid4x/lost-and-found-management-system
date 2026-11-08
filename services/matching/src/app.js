import { z } from 'zod';
import { createBaseApp } from '@findit/shared/app';
import { internalOnly } from '@findit/shared/tokens';
import { validate, objectId } from '@findit/shared/validate';
import { notFound, forbidden } from '@findit/shared/errors';
import { trusted } from '@findit/shared/db';
import { ItemProjection, Match } from './models.js';
import { matchingService, buildIdf } from './scoring.js';

const CANDIDATE_LIMIT = 300;

export const matchView = (m, mine, other) => ({
  id: String(m._id), score: m.score, reasons: m.reasons, status: m.status, createdAt: m.createdAt,
  item: other ? { id: other.itemId, type: other.type, title: other.title, category: other.category, area: other.areaLabel, date: other.date, status: other.status } : null,
  yourItemId: mine,
});

/** Score a freshly saved item against open items of the opposite type and persist matches over the threshold. */
export async function matchItem({ item, env, bus, logger }) {
  const candidates = await ItemProjection.find({
    type: item.type === 'lost' ? 'found' : 'lost',
    status: trusted({ $in: ['open', 'matched'] }),
    owner: trusted({ $ne: item.owner }),
  }).sort({ createdAt: -1 }).limit(CANDIDATE_LIMIT);
  if (!candidates.length) return [];
  const idf = buildIdf([item, ...candidates]);
  const created = [];
  for (const c of candidates) {
    const r = matchingService.score(item, c, { idf, radiusKm: env.MATCH_RADIUS_KM });
    if (r.score < env.MATCH_THRESHOLD) continue;
    const lost = item.type === 'lost' ? item : c;
    const found = item.type === 'lost' ? c : item;
    const res = await Match.updateOne(
      { lostItemId: lost.itemId, foundItemId: found.itemId },
      { $setOnInsert: { lostOwner: lost.owner, foundOwner: found.owner, score: r.score, reasons: r.reasons, status: 'suggested' } },
      { upsert: true },
    );
    if (res.upsertedCount) {
      const m = await Match.findOne({ lostItemId: lost.itemId, foundItemId: found.itemId });
      created.push(m);
      await bus.publish('match.created', {
        matchId: String(m._id), lostItemId: lost.itemId, foundItemId: found.itemId, score: r.score,
        lostOwner: lost.owner, foundOwner: found.owner, lostTitle: lost.title, foundTitle: found.title,
      });
    }
  }
  logger.info('matching complete', { item: item.itemId, created: created.length });
  return created;
}

const toProjection = (p) => ({
  itemId: p.id, type: p.type, title: p.title, description: p.description, category: p.category, date: p.date,
  areaLabel: p.areaLabel, location: { lat: p.location.lat, lng: p.location.lng }, owner: p.owner, ownerName: p.ownerName, status: p.status,
});

export function createMatchingApp({ env, logger, bus, redis = null }) {
  const { app, finish } = createBaseApp({ service: 'matching', env, logger, redis });
  // No public endpoints: everything below requires the service-to-service token.
  const internal = internalOnly(env);

  app.get('/internal/matches', internal, validate(z.object({ itemId: objectId, owner: objectId }), 'query'), async (req, res, next) => {
    try {
      const { itemId, owner } = req.query;
      const mine = await ItemProjection.findOne({ itemId });
      if (!mine || mine.owner !== owner) throw forbidden();
      const field = mine.type === 'lost' ? 'lostItemId' : 'foundItemId';
      const matches = await Match.find({ [field]: itemId, status: trusted({ $ne: 'dismissed' }) }).sort({ score: -1 }).limit(20);
      const otherIds = matches.map((m) => (mine.type === 'lost' ? m.foundItemId : m.lostItemId));
      const others = await ItemProjection.find({ itemId: trusted({ $in: otherIds }) });
      const byId = new Map(others.map((o) => [o.itemId, o]));
      res.json({ matches: matches.map((m) => matchView(m, itemId, byId.get(mine.type === 'lost' ? m.foundItemId : m.lostItemId))) });
    } catch (e) { next(e); }
  });

  app.post('/internal/matches/:id/dismiss', internal, validate(z.object({ id: objectId }), 'params'), validate(z.object({ owner: objectId }).strict()), async (req, res, next) => {
    try {
      const m = await Match.findById(req.params.id);
      if (!m) throw notFound();
      if (![m.lostOwner, m.foundOwner].includes(req.body.owner)) throw forbidden();
      m.status = 'dismissed';
      await m.save();
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  const wire = async () => {
    const upsert = async (p) => { await ItemProjection.updateOne({ itemId: p.id }, { $set: toProjection(p) }, { upsert: true }); };
    await bus.on('item.created', async (p) => { await upsert(p); await matchItem({ item: toProjection(p), env, bus, logger }); });
    await bus.on('item.updated', upsert);
    await bus.on('item.deleted', async (p) => {
      await ItemProjection.deleteOne({ itemId: p.id });
      await Match.deleteMany({ $or: [{ lostItemId: p.id }, { foundItemId: p.id }] });
    });
  };
  app.locals.wire = wire;
  return finish();
}

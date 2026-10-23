import { z } from 'zod';
import { trusted } from '@findit/shared/db';
import { pagination } from '@findit/shared/validate';
import { CATEGORIES, STATUSES } from './models.js';

export const searchSchema = pagination.extend({
  q: z.string().trim().max(100).optional(),
  type: z.enum(['lost', 'found']).optional(),
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.1).max(500).optional(),
  sort: z.enum(['new', 'date']).default('new'),
}).refine((v) => (v.lat === undefined) === (v.lng === undefined), 'lat and lng go together')
  .refine((v) => v.radiusKm === undefined || v.lat !== undefined, 'radiusKm needs lat/lng');

const EARTH_KM = 6378.1;

/** Pure query builder: every user value is already typed by zod; operators are marked trusted() on purpose. */
export function buildFilter(q) {
  const f = { hidden: false };
  f.status = q.status ?? trusted({ $in: ['open', 'matched', 'claimed'] });
  if (q.type) f.type = q.type;
  if (q.category) f.category = q.category;
  if (q.from || q.to) f.date = trusted({ ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) });
  if (q.q) f.$text = trusted({ $search: q.q });
  if (q.lat !== undefined) f.location = trusted({ $geoWithin: { $centerSphere: [[q.lng, q.lat], (q.radiusKm ?? 10) / EARTH_KM] } });
  return f;
}
export const buildSort = (q) => (q.sort === 'date' ? { date: -1 } : { createdAt: -1 });

import { z } from 'zod';
export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'invalid id');
export const validate = (schema, where = 'body') => (req, _res, next) => {
  const r = schema.safeParse(req[where]);
  if (!r.success) return next(r.error);
  req[where] = r.data;
  next();
};
export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Matching engine v1: explainable weighted score 0..100. No external AI.
// Isolated behind matchingService.score(a, b) so v2 can swap in embeddings without touching callers.

export const WEIGHTS = { text: 45, category: 12, keywords: 13, date: 10, distance: 20 };

const STOP = new Set('a an the and or of in on at to for with is was were be been it its this that i my me we our you your has have had near by from as are not no but very just found lost item'.split(' '));
const COLORS = new Set('black white red blue green yellow orange purple pink brown grey gray silver gold golden beige navy maroon cyan teal transparent'.split(' '));
const BRANDS = new Set('apple iphone samsung xiaomi redmi oppo vivo realme nokia huawei oneplus sony dell hp lenovo asus acer macbook airpods casio rolex fossil nike adidas puma gucci ray-ban hydroflask jansport'.split(' '));
const MARKS = new Set('scratch scratched sticker crack cracked dent engraved initials initial keychain keyring tag tape strap stain torn ribbon charm sleeve case cover'.split(' '));

const stem = (t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);
export function tokenize(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)).map(stem);
}

/** Inverse document frequency over a corpus (smoothed). */
export function buildIdf(docs) {
  const df = new Map();
  for (const d of docs) for (const t of new Set(tokenize(`${d.title} ${d.description}`))) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  return (t) => Math.log((1 + n) / (1 + (df.get(t) ?? 0))) + 1;
}

function tfidfVector(tokens, idf) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const v = new Map();
  for (const [t, c] of tf) v.set(t, (1 + Math.log(c)) * idf(t));
  return v;
}
export function cosine(a, b) {
  let dot = 0; let na = 0; let nb = 0;
  for (const [, x] of a) na += x * x;
  for (const [, y] of b) nb += y * y;
  for (const [t, x] of a) if (b.has(t)) dot += x * b.get(t);
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371; const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1); const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * score(a, b, opts) -> { score: 0..100, reasons: [{ factor, points, max, detail }] }
 * `a` and `b` are one lost and one found item (order does not matter).
 */
export function score(a, b, { idf = () => 1, radiusKm = 2 } = {}) {
  const lost = a.type === 'lost' ? a : b;
  const found = a.type === 'lost' ? b : a;
  const reasons = [];
  const add = (factor, points, max, detail) => reasons.push({ factor, points: round1(points), max, detail });

  // 1) Text similarity (TF-IDF cosine over title + description)
  const ta = tokenize(`${lost.title} ${lost.description}`);
  const tb = tokenize(`${found.title} ${found.description}`);
  const sim = cosine(tfidfVector(ta, idf), tfidfVector(tb, idf));
  add('text', WEIGHTS.text * sim, WEIGHTS.text, `Description similarity ${(sim * 100).toFixed(0)}%`);

  // 2) Category + keyword overlap (colour, brand, distinguishing marks)
  const sameCat = lost.category === found.category;
  add('category', sameCat ? WEIGHTS.category : 0, WEIGHTS.category, sameCat ? `Same category (${lost.category})` : `Different category (${lost.category} vs ${found.category})`);
  const sa = new Set(ta); const sb = new Set(tb);
  const shared = (set) => [...set].filter((t) => sa.has(t) && sb.has(t));
  const colours = shared(COLORS); const brands = shared(BRANDS); const marks = shared(MARKS);
  const hits = colours.length + brands.length * 1.5 + marks.length * 1.2;
  const kw = Math.min(WEIGHTS.keywords, (WEIGHTS.keywords * hits) / 3);
  const parts = [colours.length && `colour: ${colours.join(', ')}`, brands.length && `brand: ${brands.join(', ')}`, marks.length && `marks: ${marks.join(', ')}`].filter(Boolean);
  add('keywords', kw, WEIGHTS.keywords, parts.length ? `Shared ${parts.join('; ')}` : 'No shared colour, brand or marks');

  // 3) Date plausibility: found must be on/after lost (1 day tolerance), then decays over time
  const days = (new Date(found.date) - new Date(lost.date)) / 86_400_000;
  let dp = 0; let dd;
  if (days < -1) dd = `Found ${Math.abs(Math.round(days))} day(s) before it was lost`;
  else { dp = WEIGHTS.date * Math.exp(-Math.max(0, days) / 30); dd = `Found ${Math.max(0, Math.round(days))} day(s) after loss`; }
  add('date', dp, WEIGHTS.date, dd);

  // 4) Distance with decay beyond a configurable radius
  const km = haversineKm(lost.location.lat, lost.location.lng, found.location.lat, found.location.lng);
  const dist = km <= radiusKm ? WEIGHTS.distance : WEIGHTS.distance * Math.exp(-(km - radiusKm) / 10);
  add('distance', dist, WEIGHTS.distance, `${km.toFixed(1)} km apart (full score within ${radiusKm} km)`);

  const total = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)));
  return { score: round1(total), reasons };
}

export const matchingService = { score };

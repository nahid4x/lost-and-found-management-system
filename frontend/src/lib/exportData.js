/** Collects the signed-in person's own data into one object. Nothing is stored on the server for this. */

// A missing date never hides a record. The range is applied in local time, both days included.
const inRange = (iso, from, to) => {
  if (!iso) return true;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return true;
  if (from && ts < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && ts > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
};

export const EXPORT_IDS = ['account', 'reports', 'claims', 'security', 'notifications'];

/**
 * @param api      the app's api helper
 * @param options  { sections: string[] (default all), from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 * Only the selected sections are fetched.
 */
export async function collectMyData(api, { sections = EXPORT_IDS, from = '', to = '' } = {}) {
  const want = new Set(sections);
  const missing = [];
  const get = async (name, path, pick, fallback) => {
    try { return pick(await api.get(path)); } catch { missing.push(name); return fallback; }
  };
  const when = (cond, fn, fallback) => (cond ? fn() : Promise.resolve(fallback));
  const within = (list, field) => list.filter((x) => inRange(typeof field === 'function' ? field(x) : x[field], from, to));

  const [profile, notificationPreferences, reports, claimsMade, claimsOnMyItems, sessions, notifications] = await Promise.all([
    when(want.has('account'), () => get('profile', '/auth/me', (d) => d.user, null), null),
    when(want.has('account'), () => get('notificationPreferences', '/notify/preferences', (d) => d.preferences, null), null),
    when(want.has('reports'), () => get('reports', '/items/mine', (d) => d.items ?? [], []), []),
    when(want.has('claims'), () => get('claims', '/claims/mine', (d) => d.claims ?? [], []), []),
    // Other people's answers and proofs are theirs, so only a short summary of each claim is exported.
    when(want.has('claims'), () => get('claimsOnMyItems', '/claims/received', (d) => (d.claims ?? []).map((c) => ({ id: c.id, itemId: c.itemId, itemTitle: c.itemTitle, status: c.status, createdAt: c.createdAt, decidedAt: c.decidedAt ?? null })), []), []),
    // Only this person's own signed-in devices. No tokens are ever in this list.
    when(want.has('security'), () => get('security', '/auth/sessions', (d) => (d.sessions ?? []).map((s) => ({ device: s.device, ip: s.ip, loginAt: s.loginAt, lastActive: s.lastActive, current: !!s.current })), []), []),
    when(want.has('notifications'), () => get('notifications', '/notify/notifications?limit=50', (d) => d.items ?? [], []), []),
  ]);

  return {
    app: 'FindIt',
    exportedAt: new Date().toISOString(),
    sections: [...want],
    range: { from, to },
    note: 'Your reports (latest 100), your claims, a summary of claims on your found items, your signed-in devices, and your latest 50 notifications. Passwords, chat messages and private verification answers are not included.',
    profile,
    notificationPreferences,
    reports: within(reports, (i) => i.createdAt ?? i.date),
    claimsMade: within(claimsMade, 'createdAt'),
    claimsOnMyItems: within(claimsOnMyItems, 'createdAt'),
    sessions: within(sessions, 'loginAt'),
    notifications: within(notifications, 'createdAt'),
    missing,
  };
}

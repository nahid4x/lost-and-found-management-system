/** Collects the signed-in person's own data into one object. Nothing is stored on the server for this. */
export async function collectMyData(api) {
  const missing = [];
  const get = async (name, path, pick, fallback) => {
    try { return pick(await api.get(path)); } catch { missing.push(name); return fallback; }
  };
  const [profile, reports, claimsMade, claimsOnMyItems, notifications, notificationPreferences] = await Promise.all([
    get('profile', '/auth/me', (d) => d.user, null),
    get('reports', '/items/mine', (d) => d.items ?? [], []),
    get('claims', '/claims/mine', (d) => d.claims ?? [], []),
    // Other people's answers and proofs are theirs, so only a short summary of each claim is exported.
    get('claimsOnMyItems', '/claims/received', (d) => (d.claims ?? []).map((c) => ({ id: c.id, itemId: c.itemId, itemTitle: c.itemTitle, status: c.status, createdAt: c.createdAt, decidedAt: c.decidedAt ?? null })), []),
    get('notifications', '/notify/notifications?limit=50', (d) => d.items ?? [], []),
    get('notificationPreferences', '/notify/preferences', (d) => d.preferences, null),
  ]);
  return {
    app: 'FindIt',
    exportedAt: new Date().toISOString(),
    note: 'Your reports (latest 100), your claims, a summary of claims on your found items, and your latest 50 notifications. Passwords, chat messages and private verification answers are not included.',
    profile, reports, claimsMade, claimsOnMyItems, notifications, notificationPreferences,
    missing,
  };
}

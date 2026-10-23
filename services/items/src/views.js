const approx = (n) => Math.round(n * 100) / 100; // ~1 km: only approximate location is public

export function publicView(i) {
  const [lng, lat] = i.location.coordinates;
  return {
    id: String(i._id), type: i.type, title: i.title, description: i.description, category: i.category,
    images: (i.images ?? []).map((x) => x.url), date: i.date, status: i.status,
    area: { label: i.areaLabel, lat: approx(lat), lng: approx(lng) },
    ownerName: String(i.ownerName).split(' ')[0], createdAt: i.createdAt,
  };
}

/** Private fields only for the owner, an admin, or (location/held/contact) the approved claimant. */
export function viewFor(i, viewer) {
  const base = publicView(i);
  const isOwner = viewer && viewer.id === i.owner;
  const isAdmin = viewer?.role === 'admin';
  const isApproved = viewer && i.approvedClaimant && viewer.id === i.approvedClaimant;
  base.mine = Boolean(isOwner);
  if (isOwner || isAdmin || isApproved) {
    const [lng, lat] = i.location.coordinates;
    base.location = { lat, lng };
    if (i.heldAt) base.heldAt = i.heldAt;
    if (i.contactNote) base.contactNote = i.contactNote;
  }
  if (isOwner || isAdmin) {
    if (i.questions) base.questions = i.questions;
    base.history = i.history;
    base.hidden = i.hidden;
    base.approvedClaimant = i.approvedClaimant;
  }
  return base;
}

export const eventPayload = (i) => ({
  id: String(i._id), type: i.type, title: i.title, description: i.description, category: i.category,
  date: i.date, areaLabel: i.areaLabel, location: { lng: i.location.coordinates[0], lat: i.location.coordinates[1] },
  owner: i.owner, ownerName: i.ownerName, status: i.status, questions: i.questions ?? null,
});

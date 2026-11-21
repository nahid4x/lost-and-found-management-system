import { useEffect, useState } from 'react';
import { api } from './api.js';

/**
 * Profile pictures for a list of people, as { userId: url }. People without a picture are simply missing from the result,
 * so the caller falls back to their initials. It asks again when the window is focused again, so a picture someone just
 * changed shows up without a full reload.
 */
export function useAvatars(ids) {
  const key = [...new Set((ids ?? []).filter(Boolean))].sort().slice(0, 50).join(',');
  const [map, setMap] = useState({});
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    const load = () => api.get(`/auth/avatars?ids=${key}`).then((d) => { if (live) setMap(d.avatars ?? {}); }).catch(() => {});
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', load);
    return () => { live = false; document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', load); };
  }, [key]);
  return map;
}

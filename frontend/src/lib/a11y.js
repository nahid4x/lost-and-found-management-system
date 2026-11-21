// Display preferences (text size, reduced motion). Kept only in this browser: they describe the screen, not the account.
const KEY = 'findit.a11y';
export const SIZES = ['sm', 'md', 'lg', 'xl'];
const DEFAULTS = { size: 'md', motion: null }; // motion: 'reduced' | 'full' | null (null = follow the device setting)

export function loadA11y() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { size: SIZES.includes(v.size) ? v.size : DEFAULTS.size, motion: v.motion === 'reduced' || v.motion === 'full' ? v.motion : null };
  } catch { return { ...DEFAULTS }; }
}

/** Puts the choice on <html>; the CSS reads data-fs and data-motion. */
export function applyA11y(p, root = document.documentElement) {
  root.dataset.fs = p.size;
  if (p.motion) root.dataset.motion = p.motion; else delete root.dataset.motion;
}

export function saveA11y(p) {
  applyA11y(p);
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: the choice lasts until the page closes */ }
}

export const osPrefersReducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True when animations should be off: an explicit choice wins, otherwise the device setting decides. */
export const motionOff = (deviceSaysReduce) => {
  const pref = typeof document !== 'undefined' ? document.documentElement.dataset.motion : undefined;
  return pref === 'reduced' || (pref !== 'full' && Boolean(deviceSaysReduce));
};

import { useEffect, useState } from 'react';
import './theme-toggle.css';

const KEY = 'theme';

// Default is dark because the current FindIt design is dark-first.
const read = () => {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
};

export function ThemeToggle() {
  const [theme, setTheme] = useState(read);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* storage blocked: theme still applies for this session */ }
  }, [theme]);

  const dark = theme === 'dark';

  return (
    <div className="checkbox-wrapper-5 theme-toggle" title={dark ? 'Night mode' : 'Day mode'}>
      <div className="check">
        <input
          id="theme-switch"
          type="checkbox"
          role="switch"
          checked={dark}
          onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')}
          aria-label={dark ? 'Switch to day mode' : 'Switch to night mode'}
        />
        <label htmlFor="theme-switch" />
      </div>
    </div>
  );
}

export default ThemeToggle;

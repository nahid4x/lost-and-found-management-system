import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/Auth.jsx';
import { useLive } from '../context/Live.jsx';
import { initials } from '../lib/util.js';

export function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const live = useLive();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);          // mobile nav
  const [menuOpen, setMenuOpen] = useState(false);  // avatar dropdown
  const menuRef = useRef(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header className="nav">
      <Link to="/" className="brand" onClick={close}><img src="/favicon.svg" alt="" />FindIt</Link>
      <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Main">
        <NavLink to="/lost" onClick={close}>Lost</NavLink>
        <NavLink to="/found" onClick={close}>Found</NavLink>
        <NavLink to="/map" onClick={close}>Map</NavLink>
        {user && <NavLink to="/my-reports" onClick={close}>My reports</NavLink>}
        {user && <NavLink to="/claims" onClick={close}>Claims</NavLink>}
        {isAdmin && <NavLink to="/admin" onClick={close}>Admin</NavLink>}
      </nav>
      <span className="spacer" />
      {user ? (
        <>
          <Link to="/report/lost" className="btn primary sm">+ Report</Link>
          <Link to="/messages" className="icon-btn" aria-label={`Messages${live?.unreadMsgs ? `, ${live.unreadMsgs} unread` : ''}`}>💬{!!live?.unreadMsgs && <span className="badge">{live.unreadMsgs > 99 ? '99+' : live.unreadMsgs}</span>}</Link>
          <Link to="/notifications" className="icon-btn" aria-label={`Notifications${live?.unreadNotifs ? `, ${live.unreadNotifs} unread` : ''}`}>🔔{!!live?.unreadNotifs && <span className="badge">{live.unreadNotifs > 99 ? '99+' : live.unreadNotifs}</span>}</Link>

          <div className="avatar-wrap" ref={menuRef}>
            <button
              className="avatar"
              style={{ border: 0, cursor: 'pointer' }}
              aria-label={`Account menu for ${user.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials(user.name)}
            </button>
            {menuOpen && (
              <div className="avatar-menu" role="menu">
                <div className="avatar-menu-head">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
                <Link role="menuitem" to="/profile" onClick={() => { setMenuOpen(false); close(); }}>Profile</Link>
                {user.emailVerified === false && (
                  <Link role="menuitem" to="/verify-email" onClick={() => setMenuOpen(false)}>Verify email</Link>
                )}
                <button
                  role="menuitem"
                  type="button"
                  onClick={async () => { setMenuOpen(false); await logout(); nav('/'); }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <><Link to="/login" className="btn sm">Sign in</Link><Link to="/register" className="btn primary sm">Join</Link></>
      )}
      <button className="icon-btn menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>☰</button>
    </header>
  );
}
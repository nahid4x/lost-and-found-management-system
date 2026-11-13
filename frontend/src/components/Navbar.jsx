import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/Auth.jsx';
import { useLive } from '../context/Live.jsx';
import { initials } from '../lib/util.js';
import ThemeToggle from './ThemeToggle.jsx';

export function Navbar() {
  const { t } = useTranslation();
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
      <nav className={`nav-links ${open ? 'open' : ''}`} aria-label={t('nav.main')}>
        <NavLink to="/lost" onClick={close}>{t('nav.lost')}</NavLink>
        <NavLink to="/found" onClick={close}>{t('nav.found')}</NavLink>
        <NavLink to="/map" onClick={close}>{t('nav.map')}</NavLink>
        {user && <NavLink to="/my-reports" onClick={close}>{t('nav.myReports')}</NavLink>}
        {user && <NavLink to="/claims" onClick={close}>{t('nav.claims')}</NavLink>}
        {isAdmin && <NavLink to="/admin" onClick={close}>{t('nav.admin')}</NavLink>}
      </nav>
      <span className="spacer" />
      <ThemeToggle />
      {user ? (
        <>
          <Link to="/report/lost" className="btn primary sm">{t('nav.report')}</Link>
          <Link to="/messages" className="icon-btn" aria-label={t('nav.messages', { count: live?.unreadMsgs || 0 })}>💬{!!live?.unreadMsgs && <span className="badge">{live.unreadMsgs > 99 ? '99+' : live.unreadMsgs}</span>}</Link>
          <Link to="/notifications" className="icon-btn" aria-label={t('nav.notifications', { count: live?.unreadNotifs || 0 })}>🔔{!!live?.unreadNotifs && <span className="badge">{live.unreadNotifs > 99 ? '99+' : live.unreadNotifs}</span>}</Link>
          <div className="avatar-wrap" ref={menuRef}>
            <button
              className="avatar"
              style={{ border: 0, cursor: 'pointer' }}
              aria-label={t('nav.accountMenu', { name: user.name })}
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
                <Link role="menuitem" to="/profile" onClick={() => { setMenuOpen(false); close(); }}>{t('menu.profile')}</Link>
                <Link role="menuitem" to="/settings" onClick={() => { setMenuOpen(false); close(); }}>{t('menu.settings')}</Link>
                {user.emailVerified === false && (
                  <Link role="menuitem" to="/verify-email" onClick={() => setMenuOpen(false)}>{t('menu.verifyEmail')}</Link>
                )}
                <button
                  role="menuitem"
                  type="button"
                  onClick={async () => { setMenuOpen(false); await logout(); nav('/'); }}
                >
                  {t('menu.signOut')}
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <Link to="/login" className="btn sm">{t('nav.signIn')}</Link>
          <Link to="/register" className="btn primary sm">{t('nav.join')}</Link>
        </>
      )}
      <button className="icon-btn menu-btn" aria-label={t('nav.menu')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>☰</button>
    </header>
  );
}
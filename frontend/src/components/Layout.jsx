import { useState, useEffect, useRef } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import {
  Home, Search, Gift, MapPin, FileText, Handshake, MessageCircle, Settings,
  User, LogOut,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/Auth.jsx";
import "./layout.css";

const links = [
  { to: "/", label: "home", icon: Home, end: true },
  { to: "/lost", label: "lost", icon: Search },
  { to: "/found", label: "found", icon: Gift },
  { to: "/map", label: "map", icon: MapPin },
  { to: "/my-reports", label: "myReports", icon: FileText, auth: true },
  { to: "/claims", label: "claims", icon: Handshake, auth: true },
  { to: "/messages", label: "messages", icon: MessageCircle, auth: true },
  { to: "/settings", label: "settings", icon: Settings, auth: true },
];

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) {}
    return "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem("theme", theme); } catch (e) {}
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return [theme, toggle];
}

function AvatarMenu() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = user?.name || user?.fullName || "Account";
  const initial = name.trim().charAt(0).toUpperCase();
  const photo = user?.avatarUrl || user?.avatar || user?.photo;

  const signOut = async () => {
    setOpen(false);
    try { await logout?.(); } catch (e) {}
    navigate("/");
  };

  return (
    <div className="fi-avatar-wrap" ref={ref}>
      <span className="fi-hi">{t("shell.hi", { name: name.trim().split(" ")[0] })}</span>
      <button
        type="button"
        className="fi-avatar-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("shell.accountMenu")}
      >
        {photo ? <img src={photo} alt="" /> : <span>{initial}</span>}
      </button>

      {open && (
        <div className="fi-menu" role="menu">
          <div className="fi-menu-head">
            <strong>{name}</strong>
            {user?.email && <span>{user.email}</span>}
          </div>
          <Link to="/profile" role="menuitem" onClick={() => setOpen(false)}>
            <User size={16} /> {t("shell.profile")}
          </Link>
          <button type="button" role="menuitem" className="danger" onClick={signOut}>
            <LogOut size={16} /> {t("shell.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [theme, toggleTheme] = useTheme();
  const unread = 0;
  const visibleLinks = links.filter((l) => !l.auth || user);

  return (
    <div className="app-shell">
      <aside className="fi-sidebar">
        <div className="fi-brand">
          <div className="fi-brand-logo"><img src="/logo.png" alt="FindIt" /></div>
          <div>
            <h1>FindIt</h1>
            <span>{t("shell.tagline")}</span>
          </div>
        </div>

        <nav className="fi-side-nav">
          {visibleLinks.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `fi-side-link${isActive ? " active" : ""}`}
            >
              <Icon size={19} />
              <span>{t(`shell.${label}`)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="fi-side-card">Together for<br />a safer community 🤍</div>
        <div className="fi-side-foot">
          <b>FindIt</b>
          Bringing people and belongings back together.
        </div>
      </aside>

      <div className="fi-main">
        <header className="fi-topbar">
          <span className="fi-topbar-note">A safer, kinder, more connected world</span>
          <button
            type="button"
            className="fi-theme-toggle"
            onClick={toggleTheme}
            aria-label={t("shell.toggleTheme")}
            aria-pressed={theme === "dark"}
          >
            <svg className="fi-theme-icon moon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" clipRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" />
            </svg>
            <svg className="fi-theme-icon sun" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
            </svg>
          </button>
          {user ? (
            <>
              <Link to="/notifications" className="fi-bell" aria-label={t("shell.notifications")}>
                <svg viewBox="0 0 448 512" className="fi-bell-icon" aria-hidden="true">
                  <path d="M224 0c-17.7 0-32 14.3-32 32V49.9C119.5 61.4 64 124.2 64 200v33.4c0 45.4-15.5 89.5-43.8 124.9L5.3 377c-5.8 7.2-6.9 17.1-2.9 25.4S14.8 416 24 416H424c9.2 0 17.6-5.3 21.6-13.6s2.9-18.2-2.9-25.4l-14.9-18.6C399.5 322.9 384 278.8 384 233.4V200c0-75.8-55.5-138.6-128-150.1V32c0-17.7-14.3-32-32-32zm0 96h8c57.4 0 104 46.6 104 104v33.4c0 47.9 13.9 94.6 39.7 134.6H72.3C98.1 328 112 281.3 112 233.4V200c0-57.4 46.6-104 104-104h8zm64 352H224 160c0 17 6.7 33.3 18.7 45.3s28.3 18.7 45.3 18.7s33.3-6.7 45.3-18.7s18.7-28.3 18.7-45.3z" />
                </svg>
                {unread > 0 && <b className="fi-badge">{unread}</b>}
              </Link>
              <AvatarMenu />
            </>
          ) : (
            <Link to="/login" className="fi-btn fi-btn-primary">{t("shell.signIn")}</Link>
          )}
        </header>

        <main className="fi-content" id="main">
          {children}
        </main>
      </div>
    </div>
  );
}
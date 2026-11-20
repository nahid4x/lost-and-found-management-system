import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Send, Gift, ArrowRight, Search, FileText, CircleCheck, UserRound,
  ShoppingBag, Package,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.js";

const DONE = ["resolved", "returned", "recovered", "closed", "claimed"];

const timeAgo = (d, t) => {
  if (!d) return "";
  const s = Math.max(1, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 3600) return t("hp.minAgo", { count: Math.max(1, Math.floor(s / 60)) });
  if (s < 86400) return t("hp.hoursAgo", { count: Math.floor(s / 3600) });
  return t("hp.daysAgo", { count: Math.floor(s / 86400) });
};

const toList = (res) => (Array.isArray(res) ? res : res?.items ?? []);
const typeOf = (r) => String(r.type || r.kind || "").toLowerCase();
const isDone = (r) => DONE.includes(String(r.status || "").toLowerCase());

function Wave({ id }) {
  return (
    <svg className="fh-wave" viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity=".22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 62 C30 58 50 48 80 46 C110 44 130 34 160 24 C175 19 188 16 200 12 L200 80 L0 80 Z" fill={`url(#${id})`} />
      <path className="fh-wv-line" d="M0 62 C30 58 50 48 80 46 C110 44 130 34 160 24 C175 19 188 16 200 12" />
    </svg>
  );
}

function StatCard({ n, icon: Icon, value, label }) {
  return (
    <div className={`fh-stat fh-stat-${n}`}>
      <span className="fi-stat-icon"><Icon size={22} /></span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
      <Wave id={`fhWv${n}`} />
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState([]);
  const [stats, setStats] = useState({ reports: 0, recovered: 0, looking: 0, searching: 0 });

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await api.get("/items/?limit=50");
        if (!alive) return;
        const list = toList(res);

        setStats({
          reports: list.length,
          recovered: list.filter(isDone).length,
          looking: list.filter((r) => typeOf(r) === "found" && !isDone(r)).length,
          searching: list.filter((r) => typeOf(r) === "lost" && !isDone(r)).length,
        });

        setRecent(
          list
            .filter((r) => typeOf(r) === "found")
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 8)
        );
      } catch (e) {
        console.error("Home load failed", e);
      }
    })();

    return () => { alive = false; };
  }, []);

  const onSearch = (e) => {
    e.preventDefault();
    navigate(`/found?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <>
      <section className="fh-hero">
        <div className="fh-hero-text">
          <h2>{t("hp.titleA")} <em>{t("hp.titleEm")}</em><br />{t("hp.titleC")}</h2>
          <p>{t("hp.intro")}</p>
          <div className="fi-actions" style={{ margin: 0 }}>
            <Link to="/report/lost" className="fi-btn fi-fancy fi-fancy-primary">
              <span className="fi-fancy-label"><Send size={16} /> {t("hp.reportLost")}</span>
            </Link>
            <Link to="/report/found" className="fi-btn fi-fancy fi-fancy-outline">
              <span className="fi-fancy-label"><Gift size={16} /> {t("hp.reportFound")}</span>
            </Link>
          </div>
        </div>

        <div className="fh-art" aria-hidden="true">
          <img src="/hero.png" alt="" className="fh-art-img" />
        </div>
      </section>

      <form className="fh-search" onSubmit={onSearch}>
        <Search size={18} className="fh-search-icon" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("hp.searchPh")}
        />
        <button type="submit">{t("hp.search")} <ArrowRight size={15} /></button>
      </form>

      <section className="fh-stats">
        <StatCard n={1} icon={FileText} value={stats.reports} label={t("hp.reports")} />
        <StatCard n={2} icon={CircleCheck} value={stats.recovered} label={t("hp.recovered")} />
        <StatCard n={3} icon={UserRound} value={stats.looking} label={t("hp.looking")} />
        <StatCard n={4} icon={Search} value={stats.searching} label={t("hp.searching")} />
      </section>

      <section className="fh-section">
        <div className="fh-sec-head">
          <span className="fh-sec-icon"><ShoppingBag size={20} /></span>
          <div>
            <h3>{t("hp.recentTitle")}</h3>
            <small>{t("hp.recentSub")}</small>
          </div>
          <Link to="/found" className="fh-viewall">{t("hp.viewAll")} <ArrowRight size={16} /></Link>
        </div>

        {recent.length === 0 ? (
          <div className="fh-empty">{t("hp.empty")} <Link to="/report/found">{t("hp.reportOne")}</Link></div>
        ) : (
          <div className="fh-row">
            {recent.map((it) => {
              const id = it.id || it._id;
              const img = it.photoUrl || it.imageUrl || it.images?.[0]?.url || it.images?.[0];
              return (
                <Link key={id} to={`/found/${id}`} className="fh-item">
                  <div className="fh-item-img">
                    {img ? <img src={img} alt="" loading="lazy" /> : <Package size={34} />}
                  </div>
                  <b>{it.title || it.name}</b>
                  {it.createdAt && <small>{timeAgo(it.createdAt, t)}</small>}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="fh-cta2">
        <span className="fh-cta2-orb fh-cta2-orb-a" />
        <span className="fh-cta2-orb fh-cta2-orb-b" />
        <span className="fh-cta2-ring" />
        <div className="fh-cta2-text">
          <span className="fh-cta2-eyebrow">{t("hp.ctaEyebrow")}</span>
          <h3>{t("hp.ctaTitle")}</h3>
          <p>{t("hp.ctaText")}</p>
        </div>
        <div className="fh-cta2-side">
          <img className="fh-cta2-logo" src="/logo.png" alt="" />
          <Link to="/report/found" className="fh-cta2-btn">
            {t("hp.ctaBtn")} <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
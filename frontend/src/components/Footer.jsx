import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "../styles/about.css";

const TEXT = {
  en: { nav: "Footer", about: "About Us", privacy: "Privacy Policy", terms: "Terms & Conditions" },
  bn: { nav: "ফুটার", about: "আমাদের সম্পর্কে", privacy: "গোপনীয়তা নীতি", terms: "শর্তাবলি" },
};

export default function Footer() {
  const { i18n } = useTranslation();
  const s = TEXT[i18n.resolvedLanguage === "bn" ? "bn" : "en"];
  return (
    <footer className="fi-side-legal">
      <nav aria-label={s.nav}>
        <Link to="/about">{s.about}</Link>
        <Link to="/privacy">{s.privacy}</Link>
        <Link to="/terms">{s.terms}</Link>
      </nav>
      <span>© 2026 FindIt</span>
    </footer>
  );
}
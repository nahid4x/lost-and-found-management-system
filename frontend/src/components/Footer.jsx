import { Link } from "react-router-dom";
import "../styles/about.css";

export default function Footer() {
  return (
    <footer className="fi-side-legal">
      <nav aria-label="Footer">
        <Link to="/about">About Us</Link>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms &amp; Conditions</Link>
      </nav>
      <span>© 2026 FindIt</span>
    </footer>
  );
}
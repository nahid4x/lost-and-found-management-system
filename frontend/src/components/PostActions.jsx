import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listComments, subscribe } from "../lib/commentsStore.js";

const BLUE = "#3b82f6"; // liked heart (filled), readable on both light and dark cards

/** True while the theme toggle has put data-theme="light" on <html>. Follows the toggle live. */
function useIsLight() {
  const read = () => document.documentElement.getAttribute("data-theme") === "light";
  const [light, setLight] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setLight(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return light;
}

export default function PostActions({ item }) {
  const id = item._id || item.id;
  const storeKey = `post-${id}`;

  const [liked, setLiked] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem(storeKey))?.liked; } catch { return false; }
  });
  const [count, setCount] = useState(() => listComments(id).length);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const sync = () => setCount(listComments(id).length);
    sync();
    return subscribe(id, sync);
  }, [id]);

  const toggleLike = (e) => {
    const checked = e.target.checked;
    setLiked(checked);
    try {
      const old = JSON.parse(localStorage.getItem(storeKey) || "{}");
      localStorage.setItem(storeKey, JSON.stringify({ ...old, liked: checked }));
    } catch { /* ignore */ }
  };

  const share = async () => {
    const url = `${window.location.origin}/items/${id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setToast("Link copied!");
        setTimeout(() => setToast(""), 1500);
      }
    } catch { /* user cancelled */ }
  };

  // Dark mode: reaction, comment, share and their numbers are white. Light mode: black.
  // The liked heart is a filled blue. Inline styles win over any older CSS rule.
  const light = useIsLight();
  const ink = light ? "#000" : "#fff";
  const text = { color: ink };
  const iconStroke = { stroke: ink };
  const heartBtn = liked
    ? { color: ink, background: "none", border: "none", boxShadow: "none", filter: "none" }
    : text;
  const heartPath = { fill: liked ? BLUE : "none", stroke: liked ? BLUE : ink, filter: "none" };

  return (
    <div className="post-actions">
      <div className="pa-bar">
        <label className={`pa-btn pa-heart${liked ? " liked" : ""}`} style={heartBtn} title="Like" aria-label="Like">
          <input type="checkbox" checked={liked} onChange={toggleLike} />
          <svg className="pa-icon" viewBox="0 0 256 256" aria-hidden="true">
            <path
              d="M224.6,51.9a59.5,59.5,0,0,0-43-19.9,60.5,60.5,0,0,0-44,17.6L128,59.1l-7.5-7.4C97.2,28.3,59.2,26.3,35.9,47.4a59.9,59.9,0,0,0-2.3,87l83.1,83.1a15.9,15.9,0,0,0,22.6,0l81-81C243.7,113.2,245.6,75.2,224.6,51.9Z"
              strokeWidth="20" stroke="currentColor" fill="none"
              style={heartPath}
            />
          </svg>
          {liked && <span className="pa-count" style={text}>1</span>}
        </label>

        <Link to={`/items/${id}/comments`} className="pa-btn" style={text} title="Comments" aria-label="Comments">
          <svg className="pa-icon" style={iconStroke} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
          {count > 0 && <span className="pa-count" style={text}>{count}</span>}
        </Link>

        <button type="button" className="pa-btn" style={text} title="Share" aria-label="Share" onClick={share}>
          <svg className="pa-icon" style={iconStroke} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
          </svg>
        </button>
        {toast && <span className="pa-toast">{toast}</span>}
      </div>
    </div>
  );
}
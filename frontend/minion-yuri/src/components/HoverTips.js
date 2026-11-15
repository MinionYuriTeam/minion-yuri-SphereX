// Hover explanations: any element with data-tip="..." shows that one line when you
// hover it (or tab to it with the keyboard). One tooltip for the whole app.
// It is position: fixed, so it never gets cut off by a panel with overflow: hidden.
import { useEffect, useState } from "react";
import "../styles/HoverTips.css";

const DELAY = 250;
const HALF = 140;

function HoverTips() {
  const [tip, setTip] = useState(null); // { text, x, y, below }

  useEffect(() => {
    let timer;
    let current = null;

    function show(el) {
      const r = el.getBoundingClientRect();
      const below = r.top < 56; // no room above -> show it under the element
      const x = Math.min(Math.max(r.left + r.width / 2, HALF + 8), window.innerWidth - HALF - 8);
      setTip({ text: el.dataset.tip, x, y: below ? r.bottom + 8 : r.top - 8, below });
    }
    function hide() {
      clearTimeout(timer);
      current = null;
      setTip(null);
    }
    function onOver(e) {
      const el = e.target.closest ? e.target.closest("[data-tip]") : null;
      if (el === current) return;
      clearTimeout(timer);
      current = el;
      if (!el) return setTip(null);
      timer = setTimeout(() => show(el), DELAY);
    }
    function onFocus(e) {
      const el = e.target.closest ? e.target.closest("[data-tip]") : null;
      if (el && el.matches(":focus-visible")) { current = el; show(el); }
    }

    document.addEventListener("mouseover", onOver);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("mousedown", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("mousedown", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      className={`hover-tip ${tip.below ? "below" : ""}`}
      style={{ left: tip.x, top: tip.y }}
      role="tooltip"
    >
      {tip.text}
    </div>
  );
}

export default HoverTips;

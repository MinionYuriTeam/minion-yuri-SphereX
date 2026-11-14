// Easter egg trigger: type  ↑ ↑ ↓ ↓ ← → ← → B A Enter  anywhere on the page
// (not while typing in a text field) to open SPACE JUNK SWEEPER.
import { useCallback, useEffect, useState } from "react";
import SpaceJunkSweeper from "./SpaceJunkSweeper";
import "../styles/EasterEgg.css";

const SEQUENCE = ["arrowup", "arrowup", "arrowdown", "arrowdown",
                  "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a", "enter"];

function EasterEgg() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // no page scrollbar behind the full-screen game
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [open]);

  useEffect(() => {
    if (open) return;
    let progress = 0;
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === SEQUENCE[progress]) {
        progress += 1;
        if (progress === SEQUENCE.length) {
          e.preventDefault();
          setOpen(true);
        }
      } else {
        progress = key === SEQUENCE[0] ? 1 : 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return open ? <SpaceJunkSweeper onClose={close} /> : null;
}

export default EasterEgg;

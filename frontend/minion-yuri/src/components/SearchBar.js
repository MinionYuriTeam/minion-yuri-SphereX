// SAM — F1 search
// Props it gets from App.js: targets, onSearch({ ra, dec, array? }), onNoBackend(error)
// Accepts:
//   - one of our test targets ("barnard", "wise 0855")     -> instant
//   - decimal "RA, Dec" (269.45, 4.69)                       -> instant
//   - any other name ("R Dra", "Vega") or sexagesimal
//     ("08h55m10.8s -07d14m42s", "08:55:10.8 -07:14:42")   -> asks the backend (/api/resolve)
import { useState } from "react";
import { resolveName } from "../api/frames";
import "../styles/SearchBar.css";

const clean = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function SearchBar({ targets, onSearch, onNoBackend }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const typed = clean(text);
    if (!typed) return;
    setError("");

    // 1. Is it one of our test targets? ("barnard" also finds "Barnard's Star")
    const target = targets.find((t) => clean(t.name).includes(typed));
    if (target) {
      onSearch({ ra: target.ra, dec: target.dec, array: target.array });
      return;
    }

    // 2. Is it decimal "RA, Dec"?
    const parts = text.split(/[\s,]+/).filter(Boolean);
    const [ra, dec] = parts.map(Number);
    if (parts.length === 2 && !isNaN(ra) && !isNaN(dec)) {
      if (ra >= 0 && ra < 360 && dec >= -90 && dec <= 90) {
        onSearch({ ra, dec });
      } else {
        setError("RA must be 0–360 and Dec −90 to 90 degrees.");
      }
      return;
    }

    // 3. Anything else: a name or sexagesimal coordinates -> ask the backend.
    //    For names we use today's position (ra_now/dec_now): fast stars have moved.
    setBusy(true);
    try {
      const found = await resolveName(text);
      onSearch({ ra: found.ra_now ?? found.ra, dec: found.dec_now ?? found.dec });
    } catch (err) {
      // no backend running: show the same "run your own backend" guide as for coordinates
      if (err.code === "NO_BACKEND" && onNoBackend) {
        onNoBackend(err);
        return;
      }
      setError(
        err.status === 404
          ? `Couldn't find "${text}". Try a name like Barnard's Star, or coordinates like 269.45, 4.69 or 08h55m10.8s -07d14m42s`
          : err.message
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="search">Find a patch of sky</label>
      <input
        id="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Barnard's Star  ·  269.45, 4.69  ·  08h55m10.8s -07d14m42s"
      />
      <button type="submit" disabled={busy}>{busy ? "Looking up…" : "Show this patch"}</button>
      {error && <p className="search-error">{error}</p>}
    </form>
  );
}

export default SearchBar;

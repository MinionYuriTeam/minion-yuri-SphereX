// SAM — F1 search
// Props it gets from App.js: targets, onSearch({ ra, dec })
// Accepts: a target name ("barnards star", "wise 0855") or "RA, Dec" (269.45, 4.69)
import { useState } from "react";
import "../styles/SearchBar.css";

const clean = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function SearchBar({ targets, onSearch }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const typed = clean(text);
    if (!typed) return;

    // 1. Is it one of our test targets? ("barnard" also finds "Barnard's Star")
    const target = targets.find((t) => clean(t.name).includes(typed));
    if (target) {
      setError("");
      onSearch({ ra: target.ra, dec: target.dec });
      return;
    }

    // 2. Otherwise: is it "RA, Dec"?
    const [ra, dec] = text.split(",").map(Number);
    if (!isNaN(ra) && !isNaN(dec) && ra >= 0 && ra < 360 && dec >= -90 && dec <= 90) {
      setError("");
      onSearch({ ra, dec });
      return;
    }

    // 3. Neither
    setError("Not found. Try a name like Barnard's Star, or coordinates like 269.45, 4.69");
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="search">Find a patch of sky</label>
      <input
        id="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Barnard's Star  ·  269.45, 4.69"
      />
      <button type="submit">Show this patch</button>
      {error && <p className="search-error">{error}</p>}
    </form>
  );
}

export default SearchBar;
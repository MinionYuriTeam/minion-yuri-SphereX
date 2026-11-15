// SAM — F4 blink player
// Props it gets from App.js: epochs, index, setIndex
//   side     = what goes next to the image (Jay's loupe + difference)
//   children = what goes next to Speed (the FovPicker)
import { useEffect, useState } from "react";
import "../styles/BlinkPlayer.css";

const SPEEDS = [1, 2, 5];

function BlinkPlayer({ epochs, index, setIndex, side, children }) {
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState(2);
  const [crosshair, setCrosshair] = useState(true);

  useEffect(() => {
    if (!playing || epochs.length < 2) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % epochs.length);
    }, 1000 / fps);
    return () => clearInterval(timer);
  }, [playing, fps, epochs.length, setIndex]);

  if (epochs.length === 0) {
    return <p>No SPHEREx images for this patch on this detector array. Try another array or position.</p>;
  }
  const frame = epochs[Math.min(index, epochs.length - 1)];

  function step(d) {
    setPlaying(false);
    setIndex((i) => (i + d + epochs.length) % epochs.length);
  }

  return (
    <div className="player">
      <div className="viewer-row">
        <div className="viewer">
          <img
            src={frame.png_url}
            alt={`Sky on ${frame.date}`}
          />
          {/* Crosshair on the centre = the target. Gap in the middle so it never covers the star */}
          {crosshair && (
            <svg className="crosshair" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="9" />
              <line x1="50" y1="30" x2="50" y2="39" />
              <line x1="50" y1="61" x2="50" y2="70" />
              <line x1="30" y1="50" x2="39" y2="50" />
              <line x1="61" y1="50" x2="70" y2="50" />
            </svg>
          )}
          <button
            className={`crosshair-toggle ${crosshair ? "is-on" : ""}`}
            onClick={() => setCrosshair(!crosshair)}
            aria-label={crosshair ? "Hide crosshair" : "Show crosshair"}
            title={crosshair ? "Hide crosshair" : "Show crosshair"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
            </svg>
          </button>
          <div className="hud">
            <span>{frame.date}</span>
            <span>{frame.n_exposures} exposures</span>
          </div>
        </div>
        <div className="side">{side}</div>
      </div>

      <div className="transport">
        <button onClick={() => step(-1)} aria-label="Previous frame">◀</button>
        <button className="active" onClick={() => setPlaying(!playing)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button onClick={() => step(1)} aria-label="Next frame">▶</button>
        <input
          type="range" min="0" max={epochs.length - 1} value={index} aria-label="Frame"
          onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }}
        />
        <span>{index + 1}/{epochs.length}</span>
      </div>

      {/*Field of view */}
      <div className="controls-grid">
        <div className="speeds">
          <span className="speeds-label">Speed</span>
          <div className="speeds-buttons">
            {SPEEDS.map((n) => (
              <button key={n} className={n === fps ? "active" : ""} onClick={() => setFps(n)}>
                {n} fps
              </button>
            ))}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export default BlinkPlayer;
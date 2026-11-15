// JAY + SHOYA — F11 predicted track overlay
// Props it gets from App.js:
//   track       = { ra, dec, pmRa, pmDec, source } catalogue position (J2000) + proper motion
//   epochs      = the player's frames (each has a date)
//   index       = which frame is showing
//   centre      = { ra, dec } the image centre
//   widthArcsec = how much sky the image spans (size_px × pixel_scale_arcsec)
//   sizePx      = image size in SPHEREx pixels (for the ring size)
//
// Draws where the catalogue says the star should be on each frame's date:
// a dashed line through every visit's predicted position, a dot per visit, and
// a ring on the frame that's showing. If SPHEREx agrees, the star sits inside
// the ring in every frame. The ring button (next to the crosshair) hides it.
import { useMemo, useState } from "react";
import { trackPoints } from "../utils/motion";
import "../styles/GaiaMarker.css";

const inside = (p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

function GaiaMarker({ track, epochs, index, centre, widthArcsec, sizePx }) {
  const [on, setOn] = useState(true);

  const points = useMemo(() => trackPoints(track, epochs, centre, widthArcsec), [track, epochs, centre, widthArcsec]);

  if (!points.length || !points.some(inside)) return null;
  const here = points[Math.min(index, points.length - 1)];
  // ring: about 7 SPHEREx pixels across (clear of the star's glow), never smaller than 18 screen pixels
  const ring = `max(18px, ${(700 / (sizePx || 50)).toFixed(2)}%)`;
  const label = track.source || "catalogue";

  return (
    <>
      {on && (
        <div className="gaia-marker" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            {points.length > 1 && (
              <polyline points={points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} />
            )}
            {points.map((p, i) => (
              <circle key={i} cx={p.x * 100} cy={p.y * 100} r="0.45" className={i === index ? "is-now" : ""} />
            ))}
          </svg>
          {inside(here) && (
            <div className="gaia-ring" style={{ left: `${here.x * 100}%`, top: `${here.y * 100}%`, width: ring, height: ring }} />
          )}
        </div>
      )}
      <button
        className={`gaia-toggle ${on ? "is-on" : ""}`}
        onClick={() => setOn(!on)}
        aria-label={on ? "Hide predicted track" : "Show predicted track"}
        data-tip={on
          ? `Hide the predicted track (${label} position + proper motion, moved to each picture's date)`
          : `Show where ${label} says the star should be on each picture's date`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="16" cy="8" r="5" />
          <circle cx="9.5" cy="14.5" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="5.5" cy="18.5" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </>
  );
}

export default GaiaMarker;

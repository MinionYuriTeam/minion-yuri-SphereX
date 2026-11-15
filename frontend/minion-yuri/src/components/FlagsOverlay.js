// F13 — flags overlay
// Props it gets from App.js:
//   epochs = the player's frames (each may have flags_png_url)
//   index  = which frame is showing
//   on, setOn = shown or hidden (kept in App so it can go in the address bar as flags=1)
//
// The backend draws each frame's FLAGS layer as a PNG that is transparent
// except for pixels SPHEREx marked as unreliable (glare, ghosts, saturation,
// dead or hot pixels), which are red. It's the same size and orientation as
// the frame, so it simply sits on top. A frame with nothing flagged has no PNG.
import "../styles/FlagsOverlay.css";

function FlagsOverlay({ epochs, index, on, setOn }) {
  const any = epochs.some((e) => e.flags_png_url);
  const noLayer = !epochs.some((e) => "flags_png_url" in e); // false colour has no flags layer at all
  const frame = epochs[Math.min(index, epochs.length - 1)];
  const src = frame?.flags_png_url;

  return (
    <>
      {on && src && <img className="flags-layer" src={src} alt="" aria-hidden="true" />}
      <div className="flags-control">
        <button
          className={`flags-toggle ${on && any ? "is-on" : ""}`}
          onClick={() => setOn(!on)}
          disabled={!any}
          aria-pressed={on && any}
          aria-label={on ? "Hide flagged pixels" : "Show flagged pixels"}
          data-tip={noLayer
            ? "Flagged pixels are shown for one detector array at a time, not in false colour"
            : !any
            ? "No pixels are flagged in any of these pictures"
            : on
              ? "Hide the flagged pixels"
              : "Show in red the pixels SPHEREx marked as unreliable: glare and ghosts from bright stars, saturated, dead or hot pixels"}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 21V4" />
            <path d="M5 4h12l-3 4 3 4H5" />
          </svg>
        </button>
        {on && any && (
          <span className="flags-legend">
            {src ? <><i className="flags-swatch" /> Flagged pixels</> : "Nothing flagged in this picture"}
          </span>
        )}
      </div>
    </>
  );
}

export default FlagsOverlay;

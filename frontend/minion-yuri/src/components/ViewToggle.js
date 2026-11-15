// JAY — F9 view switch
// Props it gets from App.js: mode ("normal" | "difference"), onChange(mode), disabled,
//   layout ("two" | "three"), onLayout(layout)
//   two   = the lens sits on the big picture (always the real frame; the difference stays in its own panel)
//   three = big picture + the Loupe's own picture + the difference picture, side by side
// What it shows: Normal / Difference (now − first) buttons
import "../styles/DifferenceView.css";

const MODES = [
  { id: "normal", label: "Normal", tip: "Show only the pictures as they are" },
  { id: "difference", label: "Difference", tip: "Also show this picture minus the first one: anything that moved or changed lights up" },
];

function ViewToggle({ mode = "normal", onChange, disabled = false, layout = "two", onLayout }) {
  return (
    <div className="view-toggle" role="group" aria-label="View">
      <span className="view-toggle-label" data-tip="Normal pictures, or what changed since the first one">View</span>
      <div className="view-toggle-buttons">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={mode === m.id ? "active" : ""}
            aria-pressed={mode === m.id}
            disabled={disabled && m.id === "difference"}
            onClick={() => onChange?.(m.id)}
            data-tip={m.tip}
          >
            {m.label}
          </button>
        ))}
      </div>
      {onLayout && (
        <button
          className="view-layout"
          onClick={() => onLayout(layout === "two" ? "three" : "two")}
          data-tip={layout === "two"
            ? "Show the Loupe as its own picture next to the big one"
            : "Put the lens back on the big picture"}
        >
          {layout === "two" ? "Show 3 views" : "Back to 2 views"}
        </button>
      )}
    </div>
  );
}

export default ViewToggle;

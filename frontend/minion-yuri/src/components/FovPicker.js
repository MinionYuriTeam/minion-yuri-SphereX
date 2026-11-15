// SAM — F2 field of view
// Props it gets from App.js: fov, onChange(fov), loadTime
import "../styles/FovPicker.css";

// arcminutes. Bigger fields show more sky but load slower the first time, and
// more exposures are skipped (the target must be far enough from a detector edge
// to fill the whole square). The backend allows up to 60.
const FOVS = [2, 5, 10, 20, 40];

function FovPicker({ fov, onChange, loadTime }) {
  return (
    <div className="fov">
      <span className="fov-label" data-tip="How much sky you see. Small = zoomed in, big = wide (the full Moon is 30′)">
        Field of view{loadTime && ` · loaded in ${loadTime} s`}
      </span>
      <div className="fov-buttons">
        {FOVS.map((f) => (
          <button key={f} className={f === fov ? "active" : ""} onClick={() => onChange(f)}
            data-tip={`Show a patch ${f} arcminutes wide${f >= 20 ? " (takes longer the first time)" : ""}`}>
            {f}′
          </button>
        ))}
      </div>
    </div>
  );
}

export default FovPicker;
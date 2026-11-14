// SAM — F2 field of view
// Props it gets from App.js: fov, onChange(fov), loadTime
import "../styles/FovPicker.css";

const FOVS = [2, 5, 10];

function FovPicker({ fov, onChange, loadTime }) {
  return (
    <div className="fov">
      <span className="fov-label">
        Field of view{loadTime && ` · loaded in ${loadTime} s`}
      </span>
      <div className="fov-buttons">
        {FOVS.map((f) => (
          <button key={f} className={f === fov ? "active" : ""} onClick={() => onChange(f)}>
            {f}′
          </button>
        ))}
      </div>
    </div>
  );
}

export default FovPicker;
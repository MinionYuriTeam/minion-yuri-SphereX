// "This target" panel (from the high-fi design)
// Props it gets from App.js: view ({ ra, dec, fov, array }), targets, wavelength ([lo, hi] µm from the API)
import "../styles/TargetInfo.css";

// short -> long wavelength ranges of the 6 detector arrays (used until the API tells us)
const ARRAY_UM = { 1: [0.75, 1.1], 2: [1.1, 1.65], 3: [1.6, 2.4], 4: [2.4, 3.8], 5: [3.8, 4.4], 6: [4.4, 5.0] };

const close = (a, b) => Math.abs(a - b) < 0.01; // same spot (within ~36″)

function TargetInfo({ view, targets, wavelength }) {
  const target = targets.find((t) => close(t.ra, view.ra) && close(t.dec, view.dec));
  const [lo, hi] = wavelength || ARRAY_UM[view.array] || [];
  const sign = view.dec >= 0 ? "+" : "";

  return (
    <div className="target-info">
      <h3 className="target-title">This target</h3>
      {target && <p className="target-name">{target.name}</p>}
      {target && <p className="target-about">{target.about}</p>}

      <dl className="target-facts">
        <dt>RA / Dec</dt>
        <dd>{view.ra.toFixed(4)}°, {sign}{view.dec.toFixed(4)}°</dd>
        <dt>Detector array</dt>
        <dd>{view.array}{lo !== undefined && ` · ${Number(lo).toFixed(2)}–${Number(hi).toFixed(2)} µm`}</dd>
        <dt>Pixel</dt>
        <dd>6.2″ per pixel</dd>
      </dl>

      <p className="target-look">
        <strong>Look for · </strong>
        {target
          ? target.lookFor
          : "No known mover here. Let it blink and look for anything that moves or changes brightness."}
      </p>
    </div>
  );
}

export default TargetInfo;

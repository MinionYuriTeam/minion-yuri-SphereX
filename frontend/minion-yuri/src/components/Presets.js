// SAM — F8 test targets
// Props it gets from App.js: targets, current (the view), onPick(target)
import "../styles/Presets.css";

function Presets({ targets, current, onPick }) {
  return (
    <div className="presets">
      <span data-tip="Five objects we know move or change. A good place to start">Try one of these</span>
      {targets.map((t) => (
        <button
          key={t.name}
          className={t.ra === current.ra && t.dec === current.dec ? "active" : ""}
          onClick={() => onPick(t)}
          data-tip={t.about ? `${t.name}: ${t.about}` : `Jump to ${t.name}`}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}

export default Presets;
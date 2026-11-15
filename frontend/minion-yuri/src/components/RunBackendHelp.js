// Shown when a view needs a backend and none answered (error code 'NO_BACKEND').
// First it offers the spots that are built into the site (one click, no backend);
// how to run the backend yourself is folded away underneath.
// Props: api (the address we tried), presetName (if this is one of the built-in
// targets, just not with this array / field of view), targets, onPick(target), onRetry()
import { useEffect, useState } from "react";
import { getBakedIndex } from "../api/frames";
import "../styles/Presets.css";

const REPO = "https://github.com/rsinghSD/minion-yuri-SphereX";

const STEPS = [
  { what: "Get the code", cmd: `git clone ${REPO}.git\ncd minion-yuri-SphereX/backend` },
  { what: "Install (first time only, needs Python 3.11+)", cmd: "python3 -m venv .venv\n.venv/bin/pip install -r requirements.txt" },
  { what: "Start it, and leave this window open", cmd: ".venv/bin/uvicorn api:app --port 8000" },
];

function RunBackendHelp({ api, presetName, targets = [], onPick, onRetry }) {
  const [copied, setCopied] = useState(null);
  const [builtIn, setBuiltIn] = useState(null); // names that really are in public/baked/

  useEffect(() => {
    let alive = true;
    getBakedIndex().then((index) => alive && setBuiltIn(index.targets.map((t) => t.name)));
    return () => { alive = false; };
  }, []);

  // until the index has loaded, offer every target; then only the ones that are built in
  const spots = targets.filter((t) => t.name !== presetName && (!builtIn || builtIn.includes(t.name)));

  async function copy(i, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard not allowed: the text is still there to select */
    }
  }

  const isLocal = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(api);

  return (
    <div className="status run-backend">
      <p><strong>{presetName ? "This view isn't built in" : "This spot isn't built in yet"}</strong></p>
      <p>
        {presetName
          ? `${presetName} is built in for every detector array and false colour at 2′, 5′, 10′, 20′ and 40′. Pick one of those below the picture, or try another spot:`
          : `${spots.length} spots in the sky are built into this site and play straight away. Try one:`}
      </p>

      {spots.length > 0 && (
        <div className="presets run-spots">
          {spots.map((t) => (
            <button key={t.name} onClick={() => onPick?.(t)} data-tip={t.about ? `${t.name}: ${t.about}` : `Jump to ${t.name}`}>
              {t.name}
            </button>
          ))}
        </div>
      )}

      <details className="run-own">
        <summary>Want this exact spot? Run our backend on your own computer</summary>
        <p>
          Any other spot is made live from NASA's archive by our Python backend. We don't have a
          hosted one (NASA, if you're reading this, give us a backend :), so it runs on your computer.
          We tried <code>{api}</code> and nothing answered. To start it:
        </p>

        <ol className="run-steps">
          {STEPS.map((s, i) => (
            <li key={i}>
              <span>{s.what}</span>
              <div className="run-cmd">
                <pre>{s.cmd}</pre>
                <button onClick={() => copy(i, s.cmd)}>{copied === i ? "Copied" : "Copy"}</button>
              </div>
            </li>
          ))}
        </ol>

        <p className="run-note">
          Then click <strong>Try again</strong>. Chrome may ask to let this site reach your local network:
          click <strong>Allow</strong>. Safari blocks this, so use Chrome or Firefox.
          {!isLocal && " (This page is set to a custom backend; add ?api=default to the address to go back to localhost.)"}
        </p>
        <div className="run-actions">
          <button onClick={onRetry}>Try again</button>
          <a href={`${REPO}#1-run-the-backend`} target="_blank" rel="noreferrer">Full instructions</a>
        </div>
      </details>
    </div>
  );
}

export default RunBackendHelp;

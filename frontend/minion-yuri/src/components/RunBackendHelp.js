// Shown when a view needs a backend and none answered (error code 'NO_BACKEND').
// Props: api (the address we tried), presetName (if this is one of the 5 targets,
// just not with this array / field of view), onRetry()
import { useState } from "react";

const REPO = "https://github.com/rsinghSD/minion-yuri-SphereX";

const STEPS = [
  { what: "Get the code", cmd: `git clone ${REPO}.git\ncd minion-yuri-SphereX/backend` },
  { what: "Install (first time only, needs Python 3.11+)", cmd: "python3 -m venv .venv\n.venv/bin/pip install -r requirements.txt" },
  { what: "Start it, and leave this window open", cmd: ".venv/bin/uvicorn api:app --port 8000" },
];

function RunBackendHelp({ api, presetName, onRetry }) {
  const [copied, setCopied] = useState(null);

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
      <p><strong>{presetName ? "This view isn't built in" : "This spot needs your own backend"}</strong></p>
      <p>
        {presetName
          ? `${presetName} is built in for every detector array at 2′, 5′ and 10′, and for its own array at 20′ and 40′. Other combinations are made by the backend.`
          : "Our 5 test targets are built into this site. Any other spot is made live from NASA's archive by our Python backend, which you run on your own computer."}
      </p>
        <p>NASA, if you're reading this, give us a backend :)</p>
      <p>We tried <code>{api}</code> and nothing answered. To start it:</p>

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
        <button className="active" onClick={onRetry}>Try again</button>
        <a href={`${REPO}#1-run-the-backend`} target="_blank" rel="noreferrer">Full instructions</a>
      </div>
    </div>
  );
}

export default RunBackendHelp;

// What the backend is doing while a new spot loads: its download log, live.
// Props: job (the id the request was sent with, see api/frames.js getProgress)
//
// Polls GET /api/progress every 0.7 s and shows
//   - a bar: "Downloading D3 · 25 / 61 exposures · 12.3 MB"
//   - the log lines, newest at the bottom (search, every download, stacking, saving)
// Shows nothing for built-in targets (they load before the first poll), and stops
// quietly if the backend doesn't have /api/progress.
import { useEffect, useRef, useState } from "react";
import { getProgress } from "../api/frames";
import "../styles/DownloadLog.css";

const POLL_MS = 700;
const KEEP = 300; // lines kept on screen

function DownloadLog({ job }) {
  const [lines, setLines] = useState([]);
  const [fetchState, setFetchState] = useState(null);
  const boxRef = useRef(null);
  const stickRef = useRef(true); // keep scrolled to the bottom unless the visitor scrolled up

  useEffect(() => {
    if (!job) return;
    const controller = new AbortController();
    let since = 0;
    let timer;
    let misses = 0;
    setLines([]);
    setFetchState(null);

    async function poll() {
      const p = await getProgress(job, since, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!p) {
        if (++misses >= 2) return; // no backend log available: stop asking
      } else {
        misses = 0;
        since = p.next;
        if (p.lines.length) setLines((old) => [...old, ...p.lines].slice(-KEEP));
        setFetchState(p.fetch);
      }
      timer = setTimeout(poll, POLL_MS);
    }
    timer = setTimeout(poll, 600); // built-in targets are done before this
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [job]);

  useEffect(() => {
    const box = boxRef.current;
    if (box && stickRef.current) box.scrollTop = box.scrollHeight;
  }, [lines]);

  if (!lines.length && !fetchState) return null;
  const total = fetchState?.total || 0;
  const done = (fetchState?.done || 0) + (fetchState?.failed || 0);

  return (
    <div className="download-log">
      {fetchState && total > 0 && (
        <div className="download-bar" data-tip="Exposures downloaded from NASA's archive for this picture set">
          <div className="download-bar-text">
            <span>Downloading {fetchState.what}</span>
            <span>{fetchState.done} / {total} exposures · {fetchState.mb} MB{fetchState.failed ? ` · ${fetchState.failed} failed` : ""}</span>
          </div>
          <div className="download-bar-track">
            <div className="download-bar-fill" style={{ width: `${(100 * done) / total}%` }} />
          </div>
        </div>
      )}
      <pre
        ref={boxRef}
        className="download-lines"
        aria-live="polite"
        onScroll={(e) => {
          const b = e.currentTarget;
          stickRef.current = b.scrollHeight - b.scrollTop - b.clientHeight < 24;
        }}
      >
        {lines.join("\n")}
      </pre>
    </div>
  );
}

export default DownloadLog;

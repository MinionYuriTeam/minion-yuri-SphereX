// F12 spectrum chart (uses GET /api/spectrum from PR #9)
// Props it gets from App.js: ra, dec, array (the detector array the player shows, highlighted)
//
// One dot per SPHEREx exposure: how bright the target is (flux, mJy) at that exposure's
// wavelength. All six arrays together make a spectrum from 0.75 to 5 µm.
// Baked test targets load instantly; any other spot needs a backend and can take minutes
// (every exposure is downloaded), so it only starts when you press the button.
import { useEffect, useMemo, useState } from "react";
import { getSpectrum, hasBakedSpectrum } from "../api/frames";
import { GAS_BANDS, ICE_BANDS } from "../data/molecules";
import "../styles/SpectrumChart.css";

// short -> long wavelength, blue -> red
const ARRAY_COLOURS = { 1: "#6ba8ff", 2: "#5fd0e0", 3: "#6bdc8a", 4: "#e8d36b", 5: "#ff9f5a", 6: "#ff6b6b" };
const ARRAY_UM = { 1: [0.75, 1.1], 2: [1.1, 1.65], 3: [1.6, 2.4], 4: [2.4, 3.8], 5: [3.8, 4.4], 6: [4.4, 5.0] };

const W = 640, H = 300, M = { left: 58, right: 14, top: 14, bottom: 40 };
const X_DOMAIN = [0.7, 5.1];
const BINS_PER_ARRAY = 17;

// Median flux per (visit, array, wavelength bin): the backend's bin_spectrum, on the client
function binPoints(points) {
  const groups = new Map();
  for (const p of points) {
    const [lo, hi] = p.array_range_um || ARRAY_UM[p.array];
    const b = Math.min(BINS_PER_ARRAY - 1, Math.max(0,
      Math.floor((Math.log(p.wavelength_um / lo) / Math.log(hi / lo)) * BINS_PER_ARRAY)));
    const key = `${p.visit}|${p.array}|${b}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return [...groups.values()].map((g) => ({
    ...g[0],
    n: g.length,
    wavelength_um: median(g.map((p) => p.wavelength_um)),
    flux_mjy: median(g.map((p) => p.flux_mjy)),
    error_mjy: Math.sqrt(g.reduce((s, p) => s + p.error_mjy ** 2, 0)) / g.length,
    quality: g.some((p) => p.quality === "bright") ? "bright" : "good",
  }));
}

function niceLinearTicks(lo, hi, count = 8) { // gives 4–8 ticks
  const step0 = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= step0);
  const ticks = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(+t.toPrecision(12));
  return ticks;
}

const fmtFlux = (v) => (Math.abs(v) >= 1000 ? `${+(v / 1000).toPrecision(3)}k` : `${+v.toPrecision(3)}`);

const LABEL_MODES = [
  { key: "gas", label: "Atmosphere", bands: GAS_BANDS,
    tip: "Molecules in the air of brown dwarfs and cool stars (our targets)" },
  { key: "ice", label: "Ice", bands: ICE_BANDS,
    tip: "Frozen molecules on dust in cold clouds (what SPHEREx's ice survey looks for)" },
  { key: "off", label: "Off", bands: [], tip: "Hide the molecule labels" },
];

// Put each band's name in the first row where it doesn't overlap a name already there
function layoutBands(bands, sx) {
  const rowsEnd = [];
  return bands.map((b) => {
    const x0 = sx(b.lo), x1 = sx(b.hi), mid = (x0 + x1) / 2;
    const half = (b.name.length * 6.4) / 2 + 3;
    let row = rowsEnd.findIndex((end) => mid - half > end);
    if (row === -1) row = rowsEnd.length;
    rowsEnd[row] = mid + half;
    return { ...b, x0, x1, mid, row };
  });
}

function Chart({ points, array, bands }) {
  const [hover, setHover] = useState(null);
  const x0 = M.left, x1 = W - M.right, y0 = H - M.bottom, y1 = M.top;
  const sx = (um) => x0 + ((um - X_DOMAIN[0]) / (X_DOMAIN[1] - X_DOMAIN[0])) * (x1 - x0);

  // log axis when every point is positive and they span a lot; otherwise linear (faint targets go below 0)
  const fluxes = points.flatMap((p) => [p.flux_mjy - p.error_mjy, p.flux_mjy + p.error_mjy]);
  let lo = Math.min(...fluxes), hi = Math.max(...fluxes);
  const log = lo > 0 && hi / lo > 20;
  let sy, ticks;
  if (log) {
    lo = 10 ** Math.floor(Math.log10(lo));
    hi = 10 ** Math.ceil(Math.log10(hi));
    sy = (v) => y0 - ((Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (y0 - y1);
    ticks = [];
    for (let t = lo; t <= hi * 1.0001; t *= 10) ticks.push(t);
  } else {
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
    lo -= pad; hi += pad;
    ticks = niceLinearTicks(lo, hi);
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    sy = (v) => y0 - ((v - lo) / (hi - lo)) * (y0 - y1);
  }

  return (
    <>
      <svg className="spectrum-svg" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Spectrum: ${points.length} measurements from 0.75 to 5 µm`}>
        {/* the six arrays as faint bands, the one in the player highlighted */}
        {Object.entries(ARRAY_UM).map(([n, [a, b]]) => (
          <g key={n}>
            <rect x={sx(a)} y={y1} width={sx(b) - sx(a)} height={y0 - y1}
              className={`band ${Number(n) === array ? "band-now" : ""}`} />
            <text x={(sx(a) + sx(b)) / 2} y={y1 + 12} className="band-label" fill={ARRAY_COLOURS[n]}>{n}</text>
          </g>
        ))}

        {/* molecule bands: where each molecule absorbs light (dips in the spectrum) */}
        {layoutBands(bands, sx).map((b, i) => (
          <g key={`${b.name}-${i}`} data-tip={`${b.name}: absorbs around ${b.lo}–${b.hi} µm`}>
            <rect x={b.x0} y={y1} width={b.x1 - b.x0} height={y0 - y1} className="molecule" />
            <text x={b.mid} y={y1 + 28 + b.row * 13} className="molecule-label">{b.name}</text>
          </g>
        ))}

        {ticks.map((t) => (
          <g key={t}>
            <line x1={x0} x2={x1} y1={sy(t)} y2={sy(t)} className="grid" />
            <text x={x0 - 8} y={sy(t) + 4} className="tick tick-y">{fmtFlux(t)}</text>
          </g>
        ))}
        {[1, 2, 3, 4, 5].map((t) => (
          <text key={t} x={sx(t)} y={y0 + 18} className="tick">{t}</text>
        ))}
        <line x1={x0} x2={x1} y1={y0} y2={y0} className="axis" />
        <text x={(x0 + x1) / 2} y={H - 4} className="axis-title">Wavelength (µm)</text>
        <text x={14} y={(y0 + y1) / 2} className="axis-title"
          transform={`rotate(-90 14 ${(y0 + y1) / 2})`}>Flux (mJy{log ? ", log" : ""})</text>

        {points.map((p, i) => {
          const cx = sx(p.wavelength_um), cy = sy(p.flux_mjy), c = ARRAY_COLOURS[p.array];
          return (
            <g key={i} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}>
              <line x1={cx} x2={cx} y1={sy(p.flux_mjy - p.error_mjy)} y2={sy(p.flux_mjy + p.error_mjy)}
                stroke={c} className="errbar" />
              <circle cx={cx} cy={cy} r={hover === p ? 6 : 4}
                fill={p.quality === "bright" ? "none" : c} stroke={c} strokeWidth="1.6" />
              <circle cx={cx} cy={cy} r="10" fill="transparent" />{/* bigger hover target */}
            </g>
          );
        })}
      </svg>
      <p className="spectrum-readout">
        {hover
          ? <>
              <strong>{hover.wavelength_um.toFixed(3)} µm</strong> · {fmtFlux(hover.flux_mjy)} ± {fmtFlux(hover.error_mjy)} mJy
              {" "}· array {hover.array} · {hover.date}{hover.n > 1 && ` · median of ${hover.n}`}
              {hover.quality === "bright" && " · saturated core, approximate"}
            </>
          : <>Hover a dot for its value. Hollow dots = star so bright the detector saturated (approximate).</>}
      </p>
    </>
  );
}

function SpectrumChart({ ra, dec, array }) {
  const [baked, setBaked] = useState(null);   // null = still checking
  const [requested, setRequested] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [binned, setBinned] = useState(false);
  const [retry, setRetry] = useState(0);
  const [labels, setLabels] = useState("gas");

  // new spot: forget the old spectrum, check if this one is baked
  useEffect(() => {
    let alive = true;
    setData(null); setError(null); setRequested(false); setBaked(null);
    hasBakedSpectrum(ra, dec).then((b) => alive && setBaked(b));
    return () => { alive = false; };
  }, [ra, dec]);

  // load when baked (instant) or when the visitor asks for it (backend, slow)
  useEffect(() => {
    if (!(baked || requested)) return;
    const controller = new AbortController();
    setLoading(true); setError(null);
    getSpectrum({ ra, dec }, { signal: controller.signal })
      .then(setData)
      .catch((err) => { if (err.name !== "AbortError") setError(err); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ra, dec, baked, requested, retry]);

  const points = useMemo(() => {
    if (!data) return [];
    const good = data.points.filter((p) => Number.isFinite(p.flux_mjy) && Number.isFinite(p.wavelength_um));
    return binned ? binPoints(good) : good;
  }, [data, binned]);

  return (
    <div className="spectrum">
      <div className="spectrum-head">
        <h3 className="spectrum-title" data-tip="How bright the target is at each infrared wavelength SPHEREx measured">
          Spectrum
        </h3>
        {data?.points.length > 0 && (
          <div className="spectrum-controls">
          <div className="fov-buttons spectrum-mode" aria-label="Molecule labels">
            {LABEL_MODES.map((m) => (
              <button key={m.key} className={labels === m.key ? "active" : ""} onClick={() => setLabels(m.key)}
                data-tip={m.tip}>{m.label}</button>
            ))}
          </div>
          <div className="fov-buttons spectrum-mode">
            <button className={binned ? "" : "active"} onClick={() => setBinned(false)}
              data-tip="One dot per SPHEREx exposure">Every exposure</button>
            <button className={binned ? "active" : ""} onClick={() => setBinned(true)}
              data-tip="Median of nearby wavelengths per visit: steadier dots for faint targets">Averaged</button>
          </div>
          </div>
        )}
      </div>

      {baked === false && !requested && (
        <div className="spectrum-empty">
          <p>Not built in for this spot. Measuring it needs your backend and downloads every exposure, so it can take a few minutes.</p>
          <button className="active" onClick={() => setRequested(true)}>Measure spectrum</button>
        </div>
      )}

      {loading && (
        <p className="spectrum-status">
          <span className="status-spinner" aria-hidden="true" /> Measuring the target in every exposure…
        </p>
      )}

      {error && (
        <div className="spectrum-empty">
          <p>{error.code === "NO_BACKEND" ? `${error.message} Start a backend to measure spectra.` : error.message}</p>
          <button onClick={() => setRetry((r) => r + 1)}>Try again</button>
        </div>
      )}

      {data && points.length === 0 && (
        <p className="spectrum-status">No usable measurement of the target here ({data.n_exposures} exposures checked).</p>
      )}

      {data && points.length > 0 && (
        <>
          <Chart points={points} array={array}
            bands={LABEL_MODES.find((m) => m.key === labels).bands} />
          <p className="spectrum-meta">
            {data.points.length} of {data.n_exposures} exposures measured
            {data.n_dropped > 0 && ` (${data.n_dropped} skipped: target off the edge, flagged pixels or cosmic rays)`}
            {data.source === "baked" && " · built in"}
          </p>
        </>
      )}
    </div>
  );
}

export default SpectrumChart;

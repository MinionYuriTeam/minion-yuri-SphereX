// F12 spectrum chart (uses GET /api/spectrum from PR #9)
// Props it gets from App.js: ra, dec, array (the detector array the player shows, highlighted)
//
// One dot per SPHEREx exposure: how bright the target is (flux, mJy) at that exposure's
// wavelength. All six arrays together make a spectrum from 750 to 5000 nm.
// The data is in µm (as the API sends it); the chart shows nanometres.
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

const nm = (um) => Math.round(um * 1000); // µm -> nm for display
const fmtFlux = (v) => (Math.abs(v) >= 1000 ? `${+(v / 1000).toPrecision(3)}k` : `${+v.toPrecision(3)}`);

const LABEL_MODES = [
  { key: "gas", label: "Atmosphere", bands: GAS_BANDS,
    tip: "Molecules in the air of brown dwarfs and cool stars (our targets)" },
  { key: "ice", label: "Solid", bands: ICE_BANDS,
    tip: "Frozen (solid) molecules on dust in cold clouds, what SPHEREx's ice survey looks for. Too cold for our 5 targets" },
  { key: "off", label: "Off", bands: [], tip: "Hide the molecule labels" },
];

const STYLES = [
  { key: "curve", label: "Curve", tip: "A smooth line through the dots, filled with the colour of each wavelength" },
  { key: "dots", label: "Dots", tip: "Every measurement as its own dot, with error bars" },
];

// Smooth line through the dots: median flux in narrow wavelength bins, then a
// 3-bin running mean. Returns [{ um, flux }] or null when there's too little data.
const CURVE_BINS = 70;
const CURVE_MIN_BINS = 12;
const CURVE_GAP_UM = 0.3; // wider than this with no data = a gap in the line
function smoothCurve(points) {
  const [a, b] = [0.72, 5.05];
  const bins = Array.from({ length: CURVE_BINS }, () => []);
  for (const p of points) {
    const i = Math.floor((Math.log(p.wavelength_um / a) / Math.log(b / a)) * CURVE_BINS);
    if (i >= 0 && i < CURVE_BINS) bins[i].push(p);
  }
  const median = (xs) => {
    const s = [...xs].sort((u, v) => u - v), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const raw = bins.filter((g) => g.length)
    .map((g) => ({ um: median(g.map((p) => p.wavelength_um)), flux: median(g.map((p) => p.flux_mjy)) }));
  if (raw.length < CURVE_MIN_BINS) return null;
  return raw.map((p, i) => {
    const near = raw.slice(Math.max(0, i - 1), i + 2);
    return { um: p.um, flux: near.reduce((s, q) => s + q.flux, 0) / near.length };
  });
}

// The highest bumps of the curve (like the tagged peaks on a lab spectrum).
// Prominence = how far a peak rises above the lower of the two valleys around it,
// measured on screen so it works on log and linear axes alike.
function findPeaks(curve, sy, max = 4, minPx = 14) {
  const ys = curve.map((p) => sy(p.flux)); // smaller y = higher on screen
  const peaks = [];
  for (let i = 0; i < ys.length; i++) {
    if ((i > 0 && ys[i - 1] <= ys[i]) || (i < ys.length - 1 && ys[i + 1] < ys[i])) continue;
    let left = ys[i], right = ys[i];
    for (let j = i - 1; j >= 0 && ys[j] >= ys[i]; j--) left = Math.max(left, ys[j]);
    for (let j = i + 1; j < ys.length && ys[j] >= ys[i]; j++) right = Math.max(right, ys[j]);
    const prominence = Math.min(left, right) - ys[i];
    if (prominence >= minPx) peaks.push({ ...curve[i], prominence });
  }
  return peaks.sort((p, q) => q.prominence - p.prominence).slice(0, max)
    .sort((p, q) => p.um - q.um);
}

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

function Chart({ points, array, bands, style }) {
  const [hoverState, setHover] = useState(null);
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

  const curve = style === "curve" ? smoothCurve(points) : null;
  // a dot and a curve point aren't the same shape: only use a hover from what's on screen
  const hover = hoverState && Boolean(hoverState.curvePoint) === Boolean(curve) ? hoverState : null;
  const peaks = curve ? findPeaks(curve, sy) : [];
  // break the line where there are no measurements, instead of drawing a straight bridge
  const segments = [];
  (curve || []).forEach((p, i) => {
    if (i === 0 || p.um - curve[i - 1].um > CURVE_GAP_UM) segments.push([]);
    segments[segments.length - 1].push(p);
  });
  const pathOf = (seg) => seg.map((p, i) => `${i ? "L" : "M"}${sx(p.um).toFixed(1)},${sy(p.flux).toFixed(1)}`).join("");
  const line = segments.map(pathOf).join("");
  const area = segments.map((seg) =>
    `${pathOf(seg)}L${sx(seg[seg.length - 1].um).toFixed(1)},${y0}L${sx(seg[0].um).toFixed(1)},${y0}Z`).join("");

  return (
    <>
      <svg className="spectrum-svg" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Spectrum: ${points.length} measurements from 750 to 5000 nm`}>
        {/* fill colour follows wavelength: the arrays' blue (short) to red (long) */}
        <defs>
          <linearGradient id="spectrum-fill" gradientUnits="userSpaceOnUse" x1={x0} x2={x1} y1="0" y2="0">
            {Object.entries(ARRAY_UM).map(([n, [a, b]]) => (
              <stop key={n} offset={(sx((a + b) / 2) - x0) / (x1 - x0)} stopColor={ARRAY_COLOURS[n]} />
            ))}
          </linearGradient>
          <linearGradient id="spectrum-fade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.15" />
          </linearGradient>
          <mask id="spectrum-mask"><rect x="0" y="0" width={W} height={H} fill="url(#spectrum-fade)" /></mask>
        </defs>
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
          <g key={`${b.name}-${i}`} data-tip={`${b.name}: absorbs around ${nm(b.lo)}–${nm(b.hi)} nm`}>
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
          <text key={t} x={sx(t)} y={y0 + 18} className="tick">{nm(t)}</text>
        ))}
        <line x1={x0} x2={x1} y1={y0} y2={y0} className="axis" />
        <text x={(x0 + x1) / 2} y={H - 4} className="axis-title">Wavelength (nm)</text>
        <text x={14} y={(y0 + y1) / 2} className="axis-title"
          transform={`rotate(-90 14 ${(y0 + y1) / 2})`}>Flux (mJy{log ? ", log" : ""})</text>

        {curve && <path d={area} fill="url(#spectrum-fill)" mask="url(#spectrum-mask)" className="curve-fill" />}

        {/* Dots style only: one dot per measurement */}
        {!curve && points.map((p, i) => {
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

        {curve && <path d={line} className="curve-line" />}

        {/* Curve style: hover anywhere to read the curve at that wavelength */}
        {curve && hover && (
          <g className="curve-hover" pointerEvents="none">
            <line x1={sx(hover.um)} x2={sx(hover.um)} y1={y1} y2={y0} />
            <circle cx={sx(hover.um)} cy={sy(hover.flux)} r="4.5" />
          </g>
        )}
        {curve && (
          <rect x={x0} y={y1} width={x1 - x0} height={y0 - y1} fill="transparent"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
              const um = X_DOMAIN[0] + (((e.clientX - box.left) / box.width) * W - x0) / (x1 - x0) * (X_DOMAIN[1] - X_DOMAIN[0]);
              const near = curve.reduce((a, b) => (Math.abs(b.um - um) < Math.abs(a.um - um) ? b : a));
              setHover(Math.abs(near.um - um) <= CURVE_GAP_UM / 2 ? { ...near, curvePoint: true } : null);
            }} />
        )}

        {/* tagged peaks: wavelength of each big bump, like a lab spectrum */}
        {peaks.map((p) => {
          const x = sx(p.um), label = String(nm(p.um)), w = label.length * 6.6 + 8;
          return (
            <g key={p.um} className="peak" data-tip={`Peak at ${label} nm: ${fmtFlux(p.flux)} mJy`}>
              <line x1={x} x2={x} y1={sy(p.flux)} y2={y0 - 16} />
              <rect x={x - w / 2} y={y0 - 16} width={w} height="14" rx="2" />
              <text x={x} y={y0 - 5.5}>{label}</text>
            </g>
          );
        })}
      </svg>
      <p className="spectrum-readout">
        {hover && curve
          ? <><strong>{nm(hover.um)} nm</strong> · {fmtFlux(hover.flux)} mJy (smoothed)</>
          : hover
          ? <>
              <strong>{nm(hover.wavelength_um)} nm</strong> · {fmtFlux(hover.flux_mjy)} ± {fmtFlux(hover.error_mjy)} mJy
              {" "}· array {hover.array} · {hover.date}{hover.n > 1 && ` · median of ${hover.n}`}
              {hover.quality === "bright" && " · saturated core, approximate"}
            </>
          : curve
            ? <>Smoothed spectrum, yellow tags = its peaks (nm). Hover the graph for a value, or switch to Dots for every measurement.</>
            : style === "curve"
              ? <>Too few measurements for a smooth line here, showing the dots. Hover a dot for its value.</>
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
  const [style, setStyle] = useState("curve");

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
    return binned && style === "dots" ? binPoints(good) : good; // the curve always uses every exposure
  }, [data, binned, style]);

  return (
    <div className="spectrum">
      <div className="spectrum-head">
        <h3 className="spectrum-title" data-tip="How bright the target is at each infrared wavelength SPHEREx measured">
          Spectrum
        </h3>
        {data?.points.length > 0 && (
          <div className="spectrum-controls">
          <div className="fov-buttons spectrum-mode" aria-label="Chart style">
            {STYLES.map((s) => (
              <button key={s.key} className={style === s.key ? "active" : ""} onClick={() => setStyle(s.key)}
                data-tip={s.tip}>{s.label}</button>
            ))}
          </div>
          <div className="fov-buttons spectrum-mode" aria-label="Molecule labels">
            {LABEL_MODES.map((m) => (
              <button key={m.key} className={labels === m.key ? "active" : ""} onClick={() => setLabels(m.key)}
                data-tip={m.tip}>{m.label}</button>
            ))}
          </div>
          {style === "dots" && <div className="fov-buttons spectrum-mode">
            <button className={binned ? "" : "active"} onClick={() => setBinned(false)}
              data-tip="One dot per SPHEREx exposure">Every exposure</button>
            <button className={binned ? "active" : ""} onClick={() => setBinned(true)}
              data-tip="Median of nearby wavelengths per visit: steadier dots for faint targets">Averaged</button>
          </div>}
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
          <Chart points={points} array={array} style={style}
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

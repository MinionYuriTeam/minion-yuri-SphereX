// F12 spectrum chart (uses GET /api/spectrum from PR #9)
// Props it gets from App.js: ra, dec, array (the detector array the player shows, highlighted),
//   ready = the player's pictures of this spot have finished loading from a backend,
//   pm    = { pmRa, pmDec } proper motion in mas/yr (the F11 track), or null
//
// One dot per SPHEREx exposure: how bright the target is at that exposure's
// wavelength. All six arrays together make a spectrum from 750 to 5000 nm.
// The data is in µm (as the API sends it); the chart shows nanometres.
// Baked test targets load instantly. Any other spot needs a backend and downloads every
// exposure on all six arrays (about 6× the player), so it starts by itself only AFTER the
// player's pictures have loaded, and shows the backend's
// live download log while it measures. Fast stars are measured where they were on each
// exposure's date (the proper motion goes to the backend).
import { useEffect, useMemo, useState } from "react";
import { getSpectrum, hasBakedSpectrum, newJobId } from "../api/frames";
import DownloadLog from "./DownloadLog";
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
    flux: median(g.map((p) => p.flux)),
    error: Math.sqrt(g.reduce((s, p) => s + p.error ** 2, 0)) / g.length,
    quality: g.some((p) => p.quality === "bright") ? "bright" : "good",
  }));
}

function niceLinearTicks(lo, hi, count = 8) { // gives 4–8 ticks
  const step0 = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= step0);
  const ticks = [];
  // count in whole steps (no float drift) and allow a tiny overshoot relative to the step,
  // so this works for very small or very large numbers as well as numbers near 1
  const first = Math.ceil(lo / step - 1e-9), last = Math.floor(hi / step + 1e-9);
  for (let k = first; k <= last; k++) ticks.push(+(k * step).toPrecision(12));
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
  { key: "dots", label: "Dots", tip: "The measurements as dots with error bars (nearby exposures from one visit averaged)" },
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
    .map((g) => ({ um: median(g.map((p) => p.wavelength_um)), flux: median(g.map((p) => p.flux)) }));
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
  const fluxes = points.flatMap((p) => [p.flux - p.error, p.flux + p.error]);
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
          </g>
        ))}

        {/* molecule bands: where each molecule absorbs light (dips in the spectrum) */}
        {layoutBands(bands, sx).map((b, i) => (
          <g key={`${b.name}-${i}`} data-tip={`${b.name}: absorbs around ${nm(b.lo)}–${nm(b.hi)} nm`}>
            <rect x={b.x0} y={y1} width={b.x1 - b.x0} height={y0 - y1} className="molecule" />
          </g>
        ))}{/* their names are drawn last, on top of the grid lines and the curve */}

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
          transform={`rotate(-90 14 ${(y0 + y1) / 2})`}>
          Flux (mJy{log ? ", log" : ""})
        </text>

        {curve && <path d={area} fill="url(#spectrum-fill)" mask="url(#spectrum-mask)" className="curve-fill" />}

        {/* Dots style only: one dot per measurement */}
        {!curve && points.map((p, i) => {
          const cx = sx(p.wavelength_um), cy = sy(p.flux), c = ARRAY_COLOURS[p.array];
          return (
            <g key={i} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}>
              <line x1={cx} x2={cx} y1={sy(p.flux - p.error)} y2={sy(p.flux + p.error)}
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

        {/* labels last, with a background-coloured outline, so no line runs through the letters */}
        {Object.entries(ARRAY_UM).map(([n, [a, b]]) => (
          <text key={n} x={(sx(a) + sx(b)) / 2} y={y1 + 12} className="band-label label-halo"
            fill={ARRAY_COLOURS[n]} pointerEvents="none">{n}</text>
        ))}
        {layoutBands(bands, sx).map((b, i) => (
          <text key={`${b.name}-${i}`} x={b.mid} y={y1 + 28 + b.row * 13}
            className="molecule-label label-halo" pointerEvents="none">{b.name}</text>
        ))}
      </svg>
      <p className="spectrum-readout">
        {hover && curve
          ? <><strong>{nm(hover.um)} nm</strong> · {fmtFlux(hover.flux)} mJy (smoothed)</>
          : hover
          ? <>
              <strong>{nm(hover.wavelength_um)} nm</strong> · {fmtFlux(hover.flux)} ± {fmtFlux(hover.error)} mJy
              {" "}· array {hover.array} · {hover.date}{hover.n > 1 && ` · median of ${hover.n}`}
              {hover.quality === "bright" && " · saturated core, approximate"}
            </>
          : curve
            ? <>Smoothed spectrum, yellow tags = its peaks (nm). Hover the graph for a value, or switch to Dots for the measurements.</>
            : style === "curve"
              ? <>Each dot is one clean SPHEREx measurement of this spot. Hover a dot for its value.</>
              : <>Hover a dot for its value. Hollow dots = star so bright the detector saturated (approximate).</>}
      </p>
    </>
  );
}

// Bar chart under the spectrum: how many measured exposures fall in each 50 nm slice.
// Same width and margins as the spectrum, so each bar sits under its part of the curve.
const BAR_H = 130, BAR_NM = 50;
function ExposureBars({ points }) {
  const x0 = M.left, x1 = W - M.right, y0 = BAR_H - 30, y1 = 10;
  const sx = (um) => x0 + ((um - X_DOMAIN[0]) / (X_DOMAIN[1] - X_DOMAIN[0])) * (x1 - x0);
  const lo = X_DOMAIN[0] * 1000, n = Math.round((X_DOMAIN[1] - X_DOMAIN[0]) * 1000 / BAR_NM);
  const counts = new Array(n).fill(0);
  const perArray = Array.from({ length: n }, () => ({})); // which arrays the exposures in each bar came from
  for (const p of points) {
    const i = Math.floor((p.wavelength_um * 1000 - lo) / BAR_NM);
    if (i >= 0 && i < n) {
      counts[i]++;
      perArray[i][p.array] = (perArray[i][p.array] || 0) + 1;
    }
  }
  // colour a bar by the array most of its exposures came from (where arrays overlap,
  // or at the edges like array 1 below 750 nm, a fixed wavelength table gets it wrong)
  const arrayOf = (i) => Number(Object.entries(perArray[i]).sort((x, y) => y[1] - x[1])[0][0]);
  const max = Math.max(1, ...counts);
  const ticks = niceLinearTicks(0, max, 3).filter((t) => Number.isInteger(t));
  const top = Math.max(max, ticks[ticks.length - 1] || 0); // the tallest bar always fits
  const sy = (c) => y0 - (c / top) * (y0 - y1);

  return (
    <svg className="spectrum-svg exposure-bars" viewBox={`0 0 ${W} ${BAR_H}`} role="img"
      aria-label={`Exposures per wavelength: ${points.length} measured exposures`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x0} x2={x1} y1={sy(t)} y2={sy(t)} className="grid" />
          <text x={x0 - 8} y={sy(t) + 4} className="tick tick-y">{t}</text>
        </g>
      ))}
      {counts.map((c, i) => {
        if (!c) return null;
        const a = (lo + i * BAR_NM) / 1000, b = a + BAR_NM / 1000;
        return (
          <rect key={i} x={sx(a) + 0.5} y={sy(c)} width={Math.max(1, sx(b) - sx(a) - 1)} height={y0 - sy(c)}
            fill={ARRAY_COLOURS[arrayOf(i)]} className="bar"
            data-tip={`${nm(a)}–${nm(b)} nm: ${c} exposure${c > 1 ? "s" : ""} (array ${arrayOf(i)})`} />
        );
      })}
      {[1, 2, 3, 4, 5].map((t) => (
        <text key={t} x={sx(t)} y={y0 + 16} className="tick">{nm(t)}</text>
      ))}
      <line x1={x0} x2={x1} y1={y0} y2={y0} className="axis" />
      <text x={14} y={(y0 + y1) / 2} className="axis-title"
        transform={`rotate(-90 14 ${(y0 + y1) / 2})`}>Exposures</text>
    </svg>
  );
}

// noBackend = the pictures of this spot couldn't load because no backend answered
function SpectrumChart({ ra, dec, array, ready = false, pm = null, noBackend = false }) {
  const [baked, setBaked] = useState(null);   // null = still checking
  const [requested, setRequested] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [labels, setLabels] = useState("gas");
  const [style, setStyle] = useState("curve");
  const [job, setJob] = useState(null); // id of this measurement's backend log (DownloadLog)
  const pmRa = pm?.pmRa || 0, pmDec = pm?.pmDec || 0;

  // new spot: forget the old spectrum, check if this one is baked
  useEffect(() => {
    let alive = true;
    setData(null); setError(null); setRequested(false); setBaked(null);
    hasBakedSpectrum(ra, dec).then((b) => alive && setBaked(b));
    return () => { alive = false; };
  }, [ra, dec]);

  // not built in: start by itself once the player's pictures of this spot have loaded
  useEffect(() => {
    if (baked === false && ready) setRequested(true);
  }, [baked, ready]);

  // load when baked (instant) or when requested (backend, slow)
  useEffect(() => {
    if (!(baked || requested)) return;
    const controller = new AbortController();
    const jobId = newJobId();
    setJob(jobId);
    setLoading(true); setError(null);
    getSpectrum({ ra, dec, pm_ra: pmRa, pm_dec: pmDec }, { signal: controller.signal, job: jobId })
      .then(setData)
      .catch((err) => { if (err.name !== "AbortError") setError(err); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [ra, dec, pmRa, pmDec, baked, requested, retry]);

  // every measured exposure (also what the bar chart counts)
  const good = useMemo(() => (data ? data.points
    .filter((p) => Number.isFinite(p.flux_mjy) && Number.isFinite(p.wavelength_um))
    .map((p) => ({ ...p, flux: p.flux_mjy, error: p.error_mjy })) : []), [data]); // flux in mJy
  // the curve uses every exposure; Dots are always averaged (median per visit and
  // wavelength bin), which is steadier and much less cluttered than one dot per exposure
  const points = useMemo(() => (style === "dots" ? binPoints(good) : good), [good, style]);

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
          </div>
        )}
      </div>

      {baked === false && !requested && (
        <div className="spectrum-empty">
          {noBackend
            ? <p>The spectrum of this spot isn't built in. Pick one of the built-in spots above to see one.</p>
            : <p>The spectrum starts downloading by itself once the pictures above have loaded.
                It uses every exposure on all six arrays, so it can take a few minutes.</p>}
        </div>
      )}

      {loading && (
        <div className="spectrum-measuring">
          <p className="spectrum-status">
            <span className="status-spinner" aria-hidden="true" /> Measuring the target in every exposure…
          </p>
          {!baked && <DownloadLog job={job} />}
        </div>
      )}

      {error && (
        <div className="spectrum-empty">
          <p>{error.code === "NO_BACKEND" ? `${error.message} Start a backend to measure spectra.` : error.message}</p>
          <button onClick={() => setRetry((r) => r + 1)}>Try again</button>
        </div>
      )}

      {data && points.length === 0 && (
        <p className="spectrum-status">
          No clean measurement at this exact spot: all {data.n_exposures} exposures were flagged or cut off here,
          which happens in very bright or crowded regions like nebulae. Spectra work best on single stars.
        </p>
      )}

      {data && points.length > 0 && (
        <>
          <Chart points={points} array={array} style={style}
            bands={LABEL_MODES.find((m) => m.key === labels).bands} />
          <h4 className="exposure-title"
            data-tip="How many SPHEREx exposures measured the target at each wavelength (50 nm per bar)">
            Exposures per wavelength
          </h4>
          <ExposureBars points={good} />
          <p className="spectrum-meta">
            {data.points.length} clean measurements from {data.n_exposures} exposures
            {data.n_dropped > 0 && " (the rest had the target off the edge, flagged pixels or cosmic rays)"}
            {data.source === "baked" && " · built in"}
          </p>
        </>
      )}
    </div>
  );
}

export default SpectrumChart;

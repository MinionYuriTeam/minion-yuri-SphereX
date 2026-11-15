// JAY — F9 difference mode
// Props it gets from App.js: epochs (all pictures), index (the one showing now)
// What it shows: on a canvas, one of two styles (switch at the top of the panel):
//
//  Difference — current picture minus the first one.
//    brighter -> orange, darker -> teal, unchanged -> black.
//    Each picture is stretched on its own, so the average difference is removed first.
//    Boost makes small changes visible; Noise blacks out small ones.
//
//  Motion — Jay's Motion View (frontend/js/image_magnifier.js on his Y-chan branch), run over the
//    blink loop instead of a video: each picture is compared with the one before it, pixels that
//    changed keep their real colour, everything else is dimmed to 18 %. Changes build up a "heat"
//    that fades over the next pictures, so a moving object leaves a short trail.
//    Same tricks as his version: compare with the previous picture's 3×3 max (so a 1-pixel wobble
//    isn't motion), count colour changes too (false colour), and a Sensitivity slider.
//
// Loupe: a lens of its own (own spot and pin), with the Loupe's zoom and lens size
// (App.js passes the shared settings `lens` + `setLens`). Hover moves it; double-click or P pins it.
import { useEffect, useRef, useState } from "react";
import { ZOOM_MIN, ZOOM_MAX, lensLayout, useLensSpot, spotAt } from "./Loupe";
import "../styles/Loupe.css";
import "../styles/DifferenceView.css";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const BRIGHTER = [255, 138, 76]; // site orange
const FAINTER = [45, 212, 191];  // Jay's teal

// Jay's motion tuning (video mode in image_magnifier.js)
const MOVE_LEVEL = 1.0;
const HIT_GAIN = 1.0;
const WEAK_FRAC = 0.45;
const WEAK_GAIN = 0.5;
const DECAY = 0.4;
const CHROMA_W = 0.5;
const DIM = 0.18;
// Jay's sensitivity curve: 0 % -> threshold 23.3, 100 % -> 1.7 (on 0–255 brightness)
const motionThreshold = (sens) => 23.3 * Math.pow(1.7 / 23.3, sens / 100);

const STYLES = [
  { id: "difference", label: "Difference", tip: "This picture minus the first one: brighter in orange, darker in teal" },
  { id: "motion", label: "Motion", tip: "Jay's Motion View: what changed since the previous picture keeps its colour, the rest goes dark" },
];

// load a picture's pixels at a given size (null if the server doesn't allow reading them)
function loadPixels(url, w, h) {
  return new Promise((resolve) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      const c = document.createElement("canvas");
      c.width = w || im.naturalWidth;
      c.height = h || im.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(im, 0, 0, c.width, c.height);
      try {
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        const gray = new Float32Array(c.width * c.height);
        for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        resolve({ w: c.width, h: c.height, data, gray });
      } catch {
        resolve(null); // canvas tainted: no CORS
      }
    };
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

// 3×3 max filter (Jay's dilate)
function dilate(src, dst, W, H) {
  for (let y = 0; y < H; y++) {
    const y0 = y > 0 ? y - 1 : 0;
    const y1 = y < H - 1 ? y + 1 : H - 1;
    for (let x = 0; x < W; x++) {
      const x0 = x > 0 ? x - 1 : 0;
      const x1 = x < W - 1 ? x + 1 : W - 1;
      let g = 0;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) if (src[yy * W + xx] > g) g = src[yy * W + xx];
      }
      dst[y * W + x] = g;
    }
  }
}

// average brightness change from a to b (removed so a brighter stretch isn't "change")
function meanShift(a, b) {
  let m = 0;
  for (let i = 0; i < a.gray.length; i++) m += b.gray[i] - a.gray[i];
  return m / a.gray.length;
}

// Difference style: `cur` minus `base` (each { gray }) into RGBA array `out`.
// Also used by the GIF export, so the GIF looks exactly like this panel.
export const DIFF_DEFAULTS = { boost: 3, noise: 4 };
export function paintDifference(base, cur, out, boost = DIFF_DEFAULTS.boost, noise = DIFF_DEFAULTS.noise) {
  const shift = meanShift(base, cur);
  for (let i = 0, p = 0; i < base.gray.length; i++, p += 4) {
    const d = cur.gray[i] - base.gray[i] - shift;
    const a = Math.abs(d);
    const t = a <= noise ? 0 : clamp(((a - noise) * boost) / 255, 0, 1);
    const col = d > 0 ? BRIGHTER : FAINTER;
    out[p] = col[0] * t;
    out[p + 1] = col[1] * t;
    out[p + 2] = col[2] * t;
    out[p + 3] = 255;
  }
}

// Jay's motion update, one step: compare picture `cur` with `prev`, update the heat buffer
function motionStep(buf, prev, cur, thr, scratch) {
  const W = cur.w, H = cur.h;
  dilate(prev.gray, scratch, W, H);
  const shift = meanShift(prev, cur);
  const weakThr = thr * WEAK_FRAC;
  const cd = cur.data, pd = prev.data;
  for (let i = 0, p = 0; i < buf.length; i++, p += 4) {
    const dl = Math.abs(cur.gray[i] - shift - scratch[i]);
    const dcR = cd[p] - pd[p], dcG = cd[p + 1] - pd[p + 1], dcB = cd[p + 2] - pd[p + 2];
    const dcMax = Math.max(Math.abs(dcR - dcG), Math.abs(dcG - dcB), Math.abs(dcR - dcB));
    const d = Math.max(dl, dcMax * CHROMA_W);
    if (d > thr) buf[i] = Math.min(buf[i] + HIT_GAIN, 3);
    else if (d > weakThr) buf[i] = Math.min(buf[i] + WEAK_GAIN, 3);
    else buf[i] = Math.max(buf[i] - DECAY, 0);
  }
}

function DifferenceView({ epochs, index, lens, setLens }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const [lensImage, setLensImage] = useState(null); // the painted canvas as a picture, for the lens
  const hasLens = Boolean(lens && setLens);
  const [spot, setSpot, markActive] = useLensSpot("diff");
  const cacheRef = useRef(new Map()); // "url|w|h" -> pixels, so looping back is instant
  const [frames, setFrames] = useState(null); // pixels of pictures 0..index, all at the first one's size
  const [failed, setFailed] = useState(false);
  const [style, setStyle] = useState("difference");
  const [boost, setBoost] = useState(DIFF_DEFAULTS.boost);
  const [noise, setNoise] = useState(DIFF_DEFAULTS.noise);
  const [sens, setSens] = useState(60);

  const at = Math.min(index, (epochs?.length || 1) - 1);
  const first = epochs?.[0];
  const current = epochs?.[at];
  // the URLs we need: Difference only needs first + current, Motion needs every picture up to now
  const urls = (style === "motion" ? epochs.slice(0, at + 1) : [first, current]).map((e) => e?.png_url);
  const urlKey = urls.join("\n");

  useEffect(() => {
    if (!urlKey) return;
    const list = urlKey.split("\n");
    let cancelled = false;
    const cache = cacheRef.current;

    async function pixels(url, w, h) {
      const key = `${url}|${w || 0}|${h || 0}`;
      if (!cache.has(key)) cache.set(key, loadPixels(url, w, h));
      return cache.get(key);
    }

    (async () => {
      const a = await pixels(list[0]);
      // every other picture is drawn at the first one's size so the pixels line up
      const rest = a ? await Promise.all(list.slice(1).map((u) => pixels(u, a.w, a.h))) : [];
      if (cancelled) return;
      if (!a || rest.some((r) => !r)) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setFrames([a, ...rest]);
    })();

    return () => { cancelled = true; };
  }, [urlKey]);

  // paint (re-runs on the sliders without reloading anything)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frames) return;
    const base = frames[0];
    const cur = frames[frames.length - 1];
    canvas.width = base.w;
    canvas.height = base.h;
    const ctx = canvas.getContext("2d");
    const out = ctx.createImageData(base.w, base.h);
    const o = out.data;

    if (style === "motion") {
      // replay Jay's motion buffer through the loop up to this picture
      const buf = new Float32Array(base.w * base.h);
      const scratch = new Float32Array(base.w * base.h);
      const thr = motionThreshold(sens);
      for (let k = 1; k < frames.length; k++) motionStep(buf, frames[k - 1], frames[k], thr, scratch);
      const sd = cur.data;
      for (let i = 0, p = 0; i < buf.length; i++, p += 4) {
        const f = buf[i] >= MOVE_LEVEL ? 1 : DIM;
        o[p] = sd[p] * f;
        o[p + 1] = sd[p + 1] * f;
        o[p + 2] = sd[p + 2] * f;
        o[p + 3] = 255;
      }
    } else {
      paintDifference(base, cur, o, boost, noise);
    }
    ctx.putImageData(out, 0, 0);
    if (hasLens) setLensImage(canvas.toDataURL());
  }, [frames, style, boost, noise, sens, hasLens]);

  // mouse wheel zooms (the Loupe's zoom; non-passive so the page doesn't scroll)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !hasLens) return;
    const onWheel = (e) => {
      e.preventDefault();
      setLens((l) => ({ ...l, zoom: clamp(l.zoom * (e.deltaY < 0 ? 1.1 : 0.9), ZOOM_MIN, ZOOM_MAX) }));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [hasLens, setLens, failed]);

  // mouse position -> fraction of the picture (0..1), same as the Loupe stores it
  function handleMove(e) {
    markActive();
    if (!hasLens || spot.pinned || !canvasRef.current) return;
    setSpot((s) => ({ ...s, uv: spotAt(canvasRef.current, e), visible: true }));
  }

  if (!first || !current) return null;
  const isFirst = at === 0;
  // only show the result once the loaded pictures match what's asked for (no stale frame)
  const ready = frames && frames.length === urls.length;
  const prev = epochs[at - 1];

  // the lens: same maths as Loupe.js, on the difference picture
  let lensStyle = { display: "none" };
  let pixelStyle = null;
  const cv = canvasRef.current;
  if (hasLens && ready && spot.visible && spot.uv && lensImage && cv && cv.clientWidth) {
    ({ lensStyle, pixelStyle } = lensLayout({
      ...lens, uv: spot.uv, w: cv.clientWidth, h: cv.clientHeight, nw: frames[0].w, nh: frames[0].h, src: lensImage,
    }));
  }

  return (
    <div className="diff">
      <div className="diff-head">
        <div className="diff-styles" role="group" aria-label="Difference style">
          {STYLES.map((s) => (
            <button key={s.id} className={style === s.id ? "active" : ""} aria-pressed={style === s.id}
              onClick={() => setStyle(s.id)} data-tip={s.tip}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="diff-dates">
          {style === "motion"
            ? (prev ? `${current.date} vs ${prev.date}` : current.date)
            : `${current.date} − ${first.date}`}
        </span>
      </div>

      <div
        ref={stageRef}
        className={`diff-stage ${hasLens ? "has-lens" : ""}`}
        onMouseMove={handleMove}
        onMouseLeave={() => hasLens && !spot.pinned && setSpot((s) => ({ ...s, visible: false }))}
        onTouchStart={(e) => handleMove(e.touches[0])}
        onTouchMove={(e) => handleMove(e.touches[0])}
        onDoubleClick={() => hasLens && setSpot((s) => ({ ...s, pinned: !s.pinned, visible: true }))}
      >
        {failed ? (
          <p className="diff-msg">The backend doesn't allow its images to be read (CORS), so the difference can't be made here.</p>
        ) : (
          <>
            <canvas ref={canvasRef}
              style={frames ? { aspectRatio: `${frames[0].w} / ${frames[0].h}` } : undefined}
              aria-label={style === "motion" ? `Motion up to ${current.date}` : `Difference between ${current.date} and ${first.date}`} />
            {hasLens && (
              <div className={`loupe-lens ${spot.pinned ? "pinned" : ""}`} style={lensStyle}>
                {pixelStyle && <div className="loupe-pixel" style={pixelStyle} />}
              </div>
            )}
            {!ready && <p className="diff-msg diff-over">Working it out…</p>}
            {ready && isFirst && <p className="diff-msg diff-over">This is the first picture, so nothing has changed yet. Play or step to the next one.</p>}
          </>
        )}
      </div>

      {style === "motion" ? (
        <div className="diff-tools">
          <div className="diff-tool">
            <span data-tip="Higher = smaller changes count as motion">Sensitivity</span>
            <input type="range" min="0" max="100" step="5" value={sens}
              style={{ "--p": sens / 100 }}
              onChange={(e) => setSens(Number(e.target.value))} aria-label="Motion sensitivity"
              data-tip="Higher = smaller changes count as motion" />
            <span className="diff-badge">{sens}%</span>
          </div>
        </div>
      ) : (
        <div className="diff-tools">
          <div className="diff-tool">
            <span data-tip="Make small changes easier to see">Boost</span>
            <input type="range" min="1" max="10" step="0.5" value={boost}
              style={{ "--p": (boost - 1) / 9 }}
              onChange={(e) => setBoost(Number(e.target.value))} aria-label="Boost"
              data-tip="Make small changes easier to see" />
            <span className="diff-badge">{boost.toFixed(1)}×</span>
          </div>
          <div className="diff-tool">
            <span data-tip="Ignore changes smaller than this (the grainy background)">Noise</span>
            <input type="range" min="0" max="30" step="1" value={noise}
              style={{ "--p": noise / 30 }}
              onChange={(e) => setNoise(Number(e.target.value))} aria-label="Hide noise below"
              data-tip="Ignore changes smaller than this (the grainy background)" />
            <span className="diff-badge">{noise}</span>
          </div>
        </div>
      )}

      <p className="diff-legend">
        {style === "motion" ? (
          <>
            <span>Bright = changed recently (fades over the next pictures)</span>
            <span>Dark = no change</span>
          </>
        ) : (
          <>
            <span><i className="diff-key diff-key-up" /> brighter</span>
            <span><i className="diff-key diff-key-down" /> darker</span>
            <span><i className="diff-key" /> no change</span>
          </>
        )}
      </p>
    </div>
  );
}

export default DifferenceView;

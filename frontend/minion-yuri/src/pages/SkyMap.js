// PAGE — Sky map (opened via #/sky)
// The whole sky as SPHEREx saw it, from IRSA's SPHEREx DR1 all-sky map (utils/skymap.js),
// drawn on our own canvas: Mollweide oval, galactic coordinates (Milky Way across the middle).
//   - wavelength slider over all 100 non-blank SPHEREx bands, or "Colour" (3 bands as R/G/B)
//   - the 5 test targets marked; click one, or anywhere, to open the blink player there
//   - hover shows the position (RA/Dec and galactic)
import { useEffect, useMemo, useRef, useState } from "react";
import { TARGETS } from "../data/target";
import {
  ALLSKY_H, ALLSKY_W, FRAMES, WAVELENGTHS, allskyUrl, arrayOfFrame, buildLookup,
  equatorialToGalactic, frameNear, galacticToEquatorial, mollweideForward, mollweideInverse,
} from "../utils/skymap";
import "../styles/Pages.css";
import "../styles/SkyMap.css";

const W = 1200, H = 600;                 // map size in canvas pixels
const COLOUR = [frameNear(4.6), frameNear(3.3), frameNear(1.25)]; // red, green, blue
const JUMPS = [
  { um: 0.75, label: "0.75 µm", tip: "Shortest wavelength: starlight, almost like a very red camera" },
  { um: 1.6, label: "1.6 µm", tip: "Old stars shine brightest here: the bulge of the Milky Way stands out" },
  { um: 3.3, label: "3.3 µm", tip: "Warm dust glows: organic (PAH) molecules light up star-forming clouds" },
  { um: 4.6, label: "4.6 µm", tip: "Near the longest wavelength: dust lanes glow and cold objects appear" },
];

// one Allsky picture -> its grey levels (the PNG is grey; we keep the red channel)
const pixelCache = new Map(); // frame -> Promise<Uint8Array>
function loadFrame(frame) {
  if (!pixelCache.has(frame)) {
    pixelCache.set(frame, new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        const c = document.createElement("canvas");
        c.width = ALLSKY_W;
        c.height = ALLSKY_H;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(im, 0, 0);
        const rgba = ctx.getImageData(0, 0, ALLSKY_W, ALLSKY_H).data;
        const grey = new Uint8Array(ALLSKY_W * ALLSKY_H);
        for (let i = 0, p = 0; i < grey.length; i++, p += 4) grey[i] = rgba[p];
        resolve(grey);
      };
      im.onerror = () => {
        pixelCache.delete(frame); // let a later try load it again
        reject(new Error("Couldn't load the SPHEREx all-sky map from IRSA. Check your connection and try again."));
      };
      im.src = allskyUrl(frame);
    }));
  }
  return pixelCache.get(frame);
}

const fmt = (v, d = 2) => v.toFixed(d);
const signed = (v, d = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;

// open the blink player at a position
function openPlayer(ra, dec, array) {
  const q = new URLSearchParams({ ra: fmt(ra, 6), dec: fmt(dec, 6), fov: 5, array, rgb: 0 });
  window.location.href = `${window.location.pathname}?${q}#/`;
}

function SkyMap() {
  const canvasRef = useRef(null);
  const [frame, setFrame] = useState(frameNear(4.6));
  const [colour, setColour] = useState(false);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);            // bump to load again after an error
  const [hover, setHover] = useState(null);         // { ra, dec, l, b, u, v }
  const lut = useMemo(() => buildLookup(W, H), []);  // map pixel -> Allsky pixel, once

  // where the visitor came from (the player's view, kept in the address bar)
  const here = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    const ra = Number(p.get("ra")), dec = Number(p.get("dec"));
    return p.get("ra") !== null && !isNaN(ra) && !isNaN(dec) ? { ra, dec } : null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const frames = colour ? COLOUR : [frame];
    setStatus("loading");
    setError(null);
    Promise.all(frames.map(loadFrame))
      .then((layers) => {
        if (cancelled || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext("2d");
        const img = ctx.createImageData(W, H);
        const o = img.data;
        const [r, g = r, b = r] = layers;
        for (let i = 0, p = 0; i < lut.length; i++, p += 4) {
          const k = lut[i];
          if (k < 0) { o[p + 3] = 0; continue; } // outside the oval: transparent
          o[p] = r[k]; o[p + 1] = g[k]; o[p + 2] = b[k]; o[p + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setStatus("error");
      });
    return () => { cancelled = true; };
  }, [frame, colour, lut, retry]);

  function skyAt(e) {
    const r = canvasRef.current.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    const g = mollweideInverse(u, v);
    if (!g) return null;
    const { ra, dec } = galacticToEquatorial(g.l, g.b);
    return { ra, dec, l: g.l, b: g.b, u, v };
  }

  const array = colour ? 3 : arrayOfFrame(frame);
  const markers = TARGETS.map((t) => {
    const g = equatorialToGalactic(t.ra, t.dec);
    return { ...t, ...mollweideForward(g.l, g.b) };
  });
  const youAt = here && !TARGETS.some((t) => Math.abs(t.ra - here.ra) < 0.01 && Math.abs(t.dec - here.dec) < 0.01)
    ? (() => { const g = equatorialToGalactic(here.ra, here.dec); return mollweideForward(g.l, g.b); })()
    : null;
  const slot = FRAMES.indexOf(frame);

  return (
    <article className="page page-wide">
      <a href="#/" className="back">← Back to the tool</a>
      <h2>The whole sky, as SPHEREx sees it</h2>
      <p>
        SPHEREx photographs the entire sky in 102 colours of infrared light. This map squeezes the whole
        sphere into one oval: the Milky Way runs across the middle, with its centre in the middle of the map.
        Slide through the wavelengths, then <strong>click anywhere</strong> to open the blink player there.
      </p>

      <div className="sky-controls">
        <div className="sky-wavelength">
          <span className="sky-label" data-tip="Which colour of infrared light the map shows">
            {colour
              ? "Colour: 4.6 µm red · 3.3 µm green · 1.25 µm blue"
              : `Wavelength ${WAVELENGTHS[frame].toFixed(2)} µm · detector array ${arrayOfFrame(frame)}`}
            {status === "loading" && <span className="sky-label-loading"> · loading…</span>}
          </span>
          <input
            type="range" min="0" max={FRAMES.length - 1} value={slot} disabled={colour}
            aria-label="Wavelength"
            style={{ "--p": slot / (FRAMES.length - 1) }}
            data-tip="Drag to change the wavelength: short (left) to long (right)"
            onChange={(e) => setFrame(FRAMES[Number(e.target.value)])}
          />
        </div>
        <div className="sky-jumps">
          {JUMPS.map((j) => (
            <button key={j.um} className={!colour && frame === frameNear(j.um) ? "active" : ""}
              onClick={() => { setColour(false); setFrame(frameNear(j.um)); }} data-tip={j.tip}>
              {j.label}
            </button>
          ))}
          <button className={colour ? "active" : ""} onClick={() => setColour(!colour)}
            data-tip="Mix three wavelengths as red, green and blue">
            Colour
          </button>
        </div>
      </div>

      <div className="sky-stage">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className={`sky-canvas ${status === "loading" ? "is-loading" : ""}`}
          onMouseMove={(e) => setHover(skyAt(e))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { const s = skyAt(e); if (s) openPlayer(s.ra, s.dec, array); }}
          aria-label="All-sky map. Click a spot to open it in the blink player"
        />
        {status === "loading" && (
          <div className="sky-status" role="status">
            <div className="sky-loading">
              <span className="sky-spinner" aria-hidden="true" />
              Loading {colour ? "the colour map" : `${WAVELENGTHS[frame].toFixed(2)} µm`} from IRSA…
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="sky-status sky-error">
            <p>{error}</p>
            <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
          </div>
        )}
        {markers.map((m) => (
          <button key={m.name} className="sky-marker" style={{ left: `${m.u * 100}%`, top: `${m.v * 100}%` }}
            onClick={() => openPlayer(m.ra, m.dec, m.array)}
            data-tip={`${m.name}: ${m.about}. Click to open it`}>
            <span className="sky-dot" />
            <span className="sky-name">{m.name}</span>
          </button>
        ))}
        {youAt && (
          <span className="sky-here" style={{ left: `${youAt.u * 100}%`, top: `${youAt.v * 100}%` }}
            data-tip="The spot you were looking at in the player">
            <span className="sky-dot" />
            <span className="sky-name">You were here</span>
          </span>
        )}
      </div>

      <p className="sky-readout" aria-live="polite">
        {hover
          ? `RA ${fmt(hover.ra, 3)}°, Dec ${signed(hover.dec, 3)}° · galactic l ${fmt(hover.l, 1)}°, b ${signed(hover.b, 1)}° · click to open`
          : "Hover the map to see where you are. Galactic centre in the middle, galactic longitude increases to the left."}
      </p>

      <p className="credit">
        Map: SPHEREx DR1 all-sky map (HiPS), NASA/JPL-Caltech, from the NASA/IPAC Infrared Science Archive (IRSA).
        About 7′ per map pixel; the blink player shows the full 6.2″ detail.
      </p>
    </article>
  );
}

export default SkyMap;

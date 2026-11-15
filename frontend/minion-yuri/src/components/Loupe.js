// JAY — F6 zoom loupe (React version of Jay's image_magnifier.js)
// Props it gets from App.js: imageUrl (the frame the player shows right now)
//
// Hover the image  -> a round lens shows that spot zoomed in, pixels stay sharp
// Double-click / P -> pin the lens in place (dashed border), again to release
// Wheel / + / −    -> zoom 1.5× – 10×        [ / ]  -> smaller / bigger lens
// X / Y fields     -> jump to an exact pixel (pins the lens)
//
// Every lens (this one, the one on the big picture, the Difference one) has its OWN spot: where it is,
// whether it's showing, whether it's pinned (useLensSpot). Only the settings are shared through
// App.js (`lens` + `setLens`): zoom and lens size. Every lens uses the SAME zoom, so the slider,
// + / −, the keys and the mouse wheel over any picture all move every lens together.
// The spot is stored as a fraction of the image (uv: 0..1) so it fits any image size.
import { useCallback, useEffect, useRef, useState } from "react";
import "../styles/Loupe.css";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// shared lens settings; App.js keeps one of these and hands it to every lens.
export const DEFAULT_LENS = { zoom: 2.5, lensSize: 120 };

// Keyboard shortcuts work everywhere, also while a slider or button has focus
// (after dragging Zoom or Lens). They only stay out of the way while typing
// in a text box (search, X / Y), where + - [ ] P are real characters.
const NOT_TYPING = new Set(["range", "checkbox", "radio", "button", "submit", "reset", "color", "file", "image"]);
export function isTyping(e) {
  const el = e.target;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && !NOT_TYPING.has((el.type || "text").toLowerCase());
}

// one lens's own spot. P pins/unpins the lens the mouse was over last.
const NO_SPOT = { uv: null, visible: false, pinned: false };
let activeSpot = null;
export function useLensSpot(id) {
  const [spot, setSpot] = useState(NO_SPOT);
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || activeSpot !== id) return;
      if (e.key === "p" || e.key === "P") setSpot((s) => ({ ...s, pinned: !s.pinned, visible: true }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);
  const markActive = useCallback(() => { activeSpot = id; }, [id]);
  return [spot, setSpot, markActive];
}

// the spot under the mouse, as a fraction of element `el` (or null)
export function spotAt(el, e) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { u: clamp((e.clientX - r.left) / r.width, 0, 0.9999), v: clamp((e.clientY - r.top) / r.height, 0, 0.9999) };
}
export const ZOOM_MIN = 1.5, ZOOM_MAX = 10, LENS_MIN = 80, LENS_MAX = 200;

// Where to draw the round lens and the outline of the pixel under it.
//   uv: lens centre as a fraction of the picture   w, h: picture size on screen
//   nw, nh: picture size in real pixels            src: what the lens shows (zoomed)
export function lensLayout({ uv, zoom, lensSize, w, h, nw, nh, src }) {
  const dx = uv.u * w, dy = uv.v * h;
  const ix = uv.u * nw, iy = uv.v * nh; // in image pixels
  const half = lensSize / 2;
  const BORDER = 2; // lens border (Loupe.css): shift so the lens centre is exactly under the mouse
  const px = (w / nw) * zoom; // one image pixel inside the lens, in screen px
  return {
    // no outline once one pixel fills more than half the lens (small FOV + big zoom):
    // the pixel is obvious, and its outline would only show as stray edges at the rim
    pixelStyle: px > lensSize / 2 ? null : {
      width: px,
      height: px,
      left: half + (Math.floor(ix) - ix) * px,
      top: half + (Math.floor(iy) - iy) * px,
    },
    lensStyle: {
      width: lensSize,
      height: lensSize,
      left: dx - half - BORDER,
      top: dy - half - BORDER,
      backgroundImage: `url("${src}")`,
      backgroundSize: `${w * zoom}px ${h * zoom}px`,
      backgroundPosition: `${-(dx * zoom - half)}px ${-(dy * zoom - half)}px`,
    },
  };
}

// The lens on top of the big picture (2-view layout). Lives inside BlinkPlayer's viewer, covers the
// image, and draws `src` (the frame itself) zoomed by the shared zoom.
// Hover moves it, double-click pins, wheel zooms (all lenses); the zoom shows in a corner badge.
export function LensOverlay({ lens, setLens, src }) {
  const [spot, setSpot, markActive] = useLensSpot("main");
  const ref = useRef(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  // real pixel size of whatever the lens shows (for the pixel outline)
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const im = new Image();
    im.onload = () => !cancelled && setNatural({ w: im.naturalWidth, h: im.naturalHeight });
    im.src = src;
    return () => { cancelled = true; };
  }, [src]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setLens((l) => ({ ...l, zoom: clamp(l.zoom * (e.deltaY < 0 ? 1.1 : 0.9), ZOOM_MIN, ZOOM_MAX) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setLens]);

  function handleMove(e) {
    markActive();
    if (spot.pinned || !ref.current) return;
    setSpot((s) => ({ ...s, uv: spotAt(ref.current, e), visible: true }));
  }

  let styles = null;
  const el = ref.current;
  if (src && spot.visible && spot.uv && natural.w && el && el.clientWidth) {
    styles = lensLayout({ ...lens, uv: spot.uv, w: el.clientWidth, h: el.clientHeight, nw: natural.w, nh: natural.h, src });
  }

  return (
    <div
      ref={ref}
      className="lens-overlay"
      onMouseMove={handleMove}
      onMouseLeave={() => !spot.pinned && setSpot((s) => ({ ...s, visible: false }))}
      onTouchStart={(e) => handleMove(e.touches[0])}
      onTouchMove={(e) => handleMove(e.touches[0])}
      onDoubleClick={() => setSpot((s) => ({ ...s, pinned: !s.pinned, visible: true }))}
    >
      <div className={`loupe-lens ${spot.pinned ? "pinned" : ""}`} style={styles ? styles.lensStyle : { display: "none" }}>
        {styles?.pixelStyle && <div className="loupe-pixel" style={styles.pixelStyle} />}
      </div>
      {styles && <span className="lens-overlay-zoom" data-tip="Zoom (mouse wheel, + / −, or the Loupe slider)">{lens.zoom.toFixed(1)}×</span>}
    </div>
  );
}

// Button in the big picture's corner (2-view layout): turns the lens on the big picture on / off.
export function LensToggle({ on, onChange }) {
  return (
    <button
      className={`lens-toggle ${on ? "is-on" : ""}`}
      onClick={() => onChange(!on)}
      aria-label={on ? "Turn off the magnifying lens" : "Turn on the magnifying lens"}
      aria-pressed={on}
      data-tip={on ? "Turn off the magnifying lens on this picture" : "Turn on the magnifying lens on this picture"}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10" cy="10" r="6" />
        <path d="M14.5 14.5L20 20" />
        {!on && <path d="M4 20L20 4" />}
      </svg>
    </button>
  );
}

// attached = 2-view layout: the lens lives on the big picture (LensOverlay), so the Loupe shows
// only its controls (zoom, lens size), not its own copy of the picture or its own spot.
function Loupe({ imageUrl, lens: sharedLens, setLens: setSharedLens, attached = false }) {
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const samplerRef = useRef(null); // hidden canvas to read pixel colours

  const [natural, setNatural] = useState({ w: 0, h: 0 }); // real image size in pixels
  const [localLens, setLocalLens] = useState(DEFAULT_LENS); // used when App.js doesn't share one
  const [spot, setSpot, markActive] = useLensSpot("loupe");
  const [helpOpen, setHelpOpen] = useState(false);

  const lens = sharedLens || localLens;
  const setLens = setSharedLens || setLocalLens;
  // merge a change into the lens settings; `fn` gets the current settings
  const patch = useCallback((fn) => setLens((l) => ({ ...l, ...fn(l) })), [setLens]);

  const { zoom, lensSize } = lens;
  const { pinned, visible } = spot;
  const point = spot.uv && natural.w ? { x: spot.uv.u * natural.w, y: spot.uv.v * natural.h } : null; // in image pixels
  const toUv = (p) => ({ u: p.x / natural.w, v: p.y / natural.h });

  const changeZoom = (z) => patch(() => ({ zoom: clamp(z, ZOOM_MIN, ZOOM_MAX) }));
  const changeLens = (s) => patch(() => ({ lensSize: clamp(s, LENS_MIN, LENS_MAX) }));

  // load a copy of each frame into a canvas so we can read pixel colours.
  // Kept per URL, so when the loop comes back to a frame its colours are ready at once
  // (no flicker to "—" or black while the next frame loads).
  const samplersRef = useRef(new Map());
  const [, setSamplerReady] = useState(0); // re-render once a new frame's colours are ready
  useEffect(() => {
    if (!imageUrl) return;
    const cached = samplersRef.current.get(imageUrl);
    if (cached) {
      samplerRef.current = cached;
      setNatural({ w: cached.canvas.width, h: cached.canvas.height });
      return;
    }
    let cancelled = false;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      const c = document.createElement("canvas");
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(im, 0, 0);
      samplersRef.current.set(imageUrl, ctx);
      if (!cancelled) {
        samplerRef.current = ctx; // swap only when ready; until then keep the previous frame's
        setNatural({ w: c.width, h: c.height });
        setSamplerReady((n) => n + 1);
      }
    };
    im.src = imageUrl;
    return () => { cancelled = true; };
  }, [imageUrl]);

  // colour under the lens, e.g. "#1A2B3C" (null if the image doesn't allow it)
  // Pixel 27 covers 27.0 up to 27.99, so the pixel under the mouse is floor(), not round().
  function colourAt(p) {
    if (!p || !samplerRef.current) return null;
    try {
      const d = samplerRef.current.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
      return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    } catch {
      return null;
    }
  }

  // mouse position -> image pixels
  function toImagePoint(clientX, clientY) {
    const rect = imgRef.current.getBoundingClientRect();
    return {
      x: clamp(((clientX - rect.left) / rect.width) * natural.w, 0, natural.w - 1),
      y: clamp(((clientY - rect.top) / rect.height) * natural.h, 0, natural.h - 1),
    };
  }

  function handleMove(e) {
    markActive();
    if (pinned || !natural.w) return;
    setSpot((s) => ({ ...s, uv: toUv(toImagePoint(e.clientX, e.clientY)), visible: true }));
  }

  function togglePin() {
    setSpot((s) => ({ ...s, pinned: !s.pinned, visible: true }));
  }

  function jumpTo(axis, value) {
    const v = Number(value);
    if (isNaN(v) || !natural.w) return;
    const max = (axis === "x" ? natural.w : natural.h) - 1;
    // + 0.5 = the middle of that pixel, so the lens is centred on it
    const p = { x: point ? point.x : 0.5, y: point ? point.y : 0.5, [axis]: clamp(Math.floor(v), 0, max) + 0.5 };
    setSpot({ uv: toUv(p), pinned: true, visible: true });
  }

  // mouse wheel zoom (needs a non-passive listener to stop the page scrolling)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e) => {
      e.preventDefault();
      patch((l) => ({ zoom: clamp(l.zoom * (e.deltaY < 0 ? 1.1 : 0.9), ZOOM_MIN, ZOOM_MAX) }));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [imageUrl, patch]);

  // keyboard shortcuts (ignored only while typing in a text box; see isTyping)
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return; // leave browser zoom (Cmd +/−) alone
      if (e.key === "Escape") setHelpOpen(false);
      if (e.key === "+" || e.key === "=") patch((l) => ({ zoom: clamp(l.zoom + 0.5, ZOOM_MIN, ZOOM_MAX) }));
      if (e.key === "-" || e.key === "_") patch((l) => ({ zoom: clamp(l.zoom - 0.5, ZOOM_MIN, ZOOM_MAX) }));
      if (e.key === "[") patch((l) => ({ lensSize: clamp(l.lensSize - 20, LENS_MIN, LENS_MAX) }));
      if (e.key === "]") patch((l) => ({ lensSize: clamp(l.lensSize + 20, LENS_MIN, LENS_MAX) }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [patch]);

  if (!imageUrl) return null;

  // lens position + zoomed background, based on the image size on screen
  let lensStyle = { display: "none" };
  let pixelStyle = null; // outline of the exact pixel the colour is read from
  if (!attached && visible && spot.uv && imgRef.current && natural.w) {
    ({ lensStyle, pixelStyle } = lensLayout({
      ...lens, uv: spot.uv, w: imgRef.current.clientWidth, h: imgRef.current.clientHeight,
      nw: natural.w, nh: natural.h, src: imageUrl,
    }));
  }
  const hex = colourAt(point);

  return (
    <div className="loupe">
      <div className="loupe-head">
        <span className="loupe-title" data-tip="A magnifying glass for the picture, to see 1–2 pixel moves">Loupe</span>
        <button className="loupe-help-btn" onClick={() => setHelpOpen(true)} aria-label="How to use the loupe"
          data-tip="All loupe shortcuts">?</button>
      </div>

      {/* the image + the round lens on top (3-view layout only) */}
      {!attached && <div
        ref={stageRef}
        className="loupe-stage"
        onMouseMove={handleMove}
        onMouseLeave={() => !pinned && setSpot((s) => ({ ...s, visible: false }))}
        onTouchMove={(e) => handleMove(e.touches[0])}
        onTouchStart={(e) => handleMove(e.touches[0])}
        onDoubleClick={togglePin}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Current frame, hover to magnify"
          draggable="false"
          onLoad={(e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
        />
        <div className={`loupe-lens ${pinned ? "pinned" : ""}`} style={lensStyle}>
          {pixelStyle && <div className="loupe-pixel" style={pixelStyle} />}
        </div>
      </div>}

      {/* zoom + lens size */}
      <div className="loupe-tools">
        <div className="loupe-tool">
          <span data-tip="How much the lens magnifies">Zoom</span>
          <button onClick={() => changeZoom(zoom - 0.5)} aria-label="Zoom out" data-tip="Zoom out">−</button>
          <input type="range" min="1.5" max="10" step="0.5" value={zoom}
            style={{ "--p": (zoom - 1.5) / (10 - 1.5) }}
            onChange={(e) => changeZoom(Number(e.target.value))} aria-label="Zoom level"
            data-tip="How much the lens magnifies (also: mouse wheel)" />
          <button onClick={() => changeZoom(zoom + 0.5)} aria-label="Zoom in" data-tip="Zoom in">+</button>
          <span className="loupe-badge">{zoom.toFixed(1)}×</span>
        </div>
        <div className="loupe-tool">
          <span data-tip="Size of the magnifying circle">Lens</span>
          <input type="range" min="80" max="200" step="10" value={lensSize}
            style={{ "--p": (lensSize - 80) / (200 - 80) }}
            onChange={(e) => changeLens(Number(e.target.value))} aria-label="Lens size"
            data-tip="Size of the magnifying circle (also: [ and ] keys)" />
          <span className="loupe-badge">{lensSize}px</span>
        </div>
      </div>

      {/* hint line: always there (fixed height), only the text changes, so the layout never jumps */}
      <p className="loupe-hint">
        {attached
          ? "Hover the big picture to magnify · double-click or P to pin"
          : pinned
            ? "Pinned · double-click or P to unpin"
            : visible
              ? "Double-click or P to pin the lens"
              : "Hover the image to magnify"}
      </p>

      {/* readout: exact pixel, colour, image size (for this lens's own picture: 3-view only) */}
      {!attached && <div className="loupe-readout">
        <label data-tip="Pixel column under the lens. Type a number to jump there">X <input type="number" min="0" value={point ? Math.floor(point.x) : 0}
          onChange={(e) => jumpTo("x", e.target.value)} /></label>
        <label data-tip="Pixel row under the lens. Type a number to jump there">Y <input type="number" min="0" value={point ? Math.floor(point.y) : 0}
          onChange={(e) => jumpTo("y", e.target.value)} /></label>
        <span className="loupe-colour" data-tip="Colour of the pixel under the lens. Brighter = more infrared light">
          <span className="loupe-swatch" style={{ background: hex || "transparent" }} />
          {hex || "—"}
        </span>
        <span className="loupe-dim" data-tip="Size of the picture in pixels (1 pixel = 6.2″ of sky)">{natural.w ? `${natural.w} × ${natural.h}` : "—"}</span>
      </div>}

      {/* help guide (Jay's modal) */}
      {helpOpen && (
        <div className="loupe-modal-overlay" onClick={(e) => e.target === e.currentTarget && setHelpOpen(false)}>
          <div className="loupe-modal" role="dialog" aria-modal="true" aria-labelledby="loupeHelpTitle">
            <button className="loupe-close" onClick={() => setHelpOpen(false)} aria-label="Close">×</button>
            <h2 id="loupeHelpTitle">Loupe guide</h2>
            <ul>
              <li><span>Magnify a spot</span><kbd>hover</kbd></li>
              <li><span>Freeze / release the lens</span><kbd>double-click</kbd> or <kbd>P</kbd></li>
              <li><span>Zoom in / out</span><kbd>+</kbd> <kbd>−</kbd> or <kbd>wheel</kbd></li>
              <li><span>Smaller / bigger lens</span><kbd>[</kbd> <kbd>]</kbd></li>
              <li><span>Jump to an exact pixel</span><kbd>X / Y fields</kbd></li>
              <li><span>Close this guide</span><kbd>Esc</kbd></li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default Loupe;

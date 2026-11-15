// JAY — F6 zoom loupe (React version of Jay's image_magnifier.js)
// Props it gets from App.js: imageUrl (the frame the player shows right now)
//
// Hover the image  -> a round lens shows that spot zoomed in, pixels stay sharp
// Double-click / P -> pin the lens in place (dashed border), again to release
// Wheel / + / −    -> zoom 1.5× – 10×        [ / ]  -> smaller / bigger lens
// X / Y fields     -> jump to an exact pixel (pins the lens)
import { useEffect, useRef, useState } from "react";
import "../styles/Loupe.css";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function Loupe({ imageUrl }) {
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const samplerRef = useRef(null); // hidden canvas to read pixel colours

  const [natural, setNatural] = useState({ w: 0, h: 0 }); // real image size in pixels
  const [point, setPoint] = useState(null);               // lens position in image pixels
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [zoom, setZoom] = useState(2.5);
  const [lensSize, setLensSize] = useState(120);
  const [helpOpen, setHelpOpen] = useState(false);

  const changeZoom = (z) => setZoom(clamp(z, 1.5, 10));
  const changeLens = (s) => setLensSize(clamp(s, 80, 200));

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
        setSamplerReady((n) => n + 1);
      }
    };
    im.src = imageUrl;
    return () => { cancelled = true; };
  }, [imageUrl]);

  // colour under the lens, e.g. "#1A2B3C" (null if the image doesn't allow it)
  function colourAt(p) {
    if (!p || !samplerRef.current) return null;
    try {
      const d = samplerRef.current.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
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
    if (pinned || !natural.w) return;
    setPoint(toImagePoint(e.clientX, e.clientY));
    setVisible(true);
  }

  function togglePin() {
    setPinned((p) => !p);
    setVisible(true);
  }

  function jumpTo(axis, value) {
    const v = Number(value);
    if (isNaN(v) || !natural.w) return;
    const max = (axis === "x" ? natural.w : natural.h) - 1;
    setPoint((p) => ({ x: p ? p.x : 0, y: p ? p.y : 0, [axis]: clamp(v, 0, max) }));
    setPinned(true);
    setVisible(true);
  }

  // mouse wheel zoom (needs a non-passive listener to stop the page scrolling)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.1 : 0.9), 1.5, 10));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [imageUrl]);

  // keyboard shortcuts (ignored while typing in a field)
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "Escape") setHelpOpen(false);
      if (e.key === "+" || e.key === "=") setZoom((z) => clamp(z + 0.5, 1.5, 10));
      if (e.key === "-" || e.key === "_") setZoom((z) => clamp(z - 0.5, 1.5, 10));
      if (e.key === "[") setLensSize((s) => clamp(s - 20, 80, 200));
      if (e.key === "]") setLensSize((s) => clamp(s + 20, 80, 200));
      if (e.key === "p" || e.key === "P") {
        setPinned((p) => !p);
        setVisible(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!imageUrl) return null;

  // lens position + zoomed background, based on the image size on screen
  let lensStyle = { display: "none" };
  if (visible && point && imgRef.current && natural.w) {
    const w = imgRef.current.clientWidth;
    const h = imgRef.current.clientHeight;
    const dx = (point.x / natural.w) * w;
    const dy = (point.y / natural.h) * h;
    const half = lensSize / 2;
    lensStyle = {
      width: lensSize,
      height: lensSize,
      left: dx - half,
      top: dy - half,
      backgroundImage: `url("${imageUrl}")`,
      backgroundSize: `${w * zoom}px ${h * zoom}px`,
      backgroundPosition: `${-(dx * zoom - half)}px ${-(dy * zoom - half)}px`,
    };
  }
  const hex = colourAt(point);

  return (
    <div className="loupe">
      <div className="loupe-head">
        <span className="loupe-title">Loupe</span>
        <button className="loupe-help-btn" onClick={() => setHelpOpen(true)} aria-label="How to use the loupe">?</button>
      </div>

      {/* the image + the round lens on top */}
      <div
        ref={stageRef}
        className="loupe-stage"
        onMouseMove={handleMove}
        onMouseLeave={() => !pinned && setVisible(false)}
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
        <div className={`loupe-lens ${pinned ? "pinned" : ""}`} style={lensStyle} />
      </div>

      {/* zoom + lens size */}
      <div className="loupe-tools">
        <div className="loupe-tool">
          <span>Zoom</span>
          <button onClick={() => changeZoom(zoom - 0.5)} aria-label="Zoom out">−</button>
          <input type="range" min="1.5" max="10" step="0.5" value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))} aria-label="Zoom level" />
          <button onClick={() => changeZoom(zoom + 0.5)} aria-label="Zoom in">+</button>
          <span className="loupe-badge">{zoom.toFixed(1)}×</span>
        </div>
        <div className="loupe-tool">
          <span>Lens</span>
          <input type="range" min="80" max="200" step="10" value={lensSize}
            onChange={(e) => changeLens(Number(e.target.value))} aria-label="Lens size" />
          <span className="loupe-badge">{lensSize}px</span>
        </div>
      </div>

      {/* hint line: always there (fixed height), only the text changes, so the layout never jumps */}
      <p className="loupe-hint">
        {pinned
          ? "Pinned · double-click or P to unpin"
          : visible
            ? "Double-click or P to pin the lens"
            : "Hover the image to magnify"}
      </p>

      {/* readout: exact pixel, colour, image size */}
      <div className="loupe-readout">
        <label>X <input type="number" min="0" value={point ? Math.round(point.x) : 0}
          onChange={(e) => jumpTo("x", e.target.value)} /></label>
        <label>Y <input type="number" min="0" value={point ? Math.round(point.y) : 0}
          onChange={(e) => jumpTo("y", e.target.value)} /></label>
        <span className="loupe-colour">
          <span className="loupe-swatch" style={{ background: hex || "transparent" }} />
          {hex || "—"}
        </span>
        <span className="loupe-dim">{natural.w ? `${natural.w} × ${natural.h}` : "—"}</span>
      </div>

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

// "⬇ GIF" button: turns the frames that are playing into an animated GIF and downloads it.
// Pressing it first opens a small options screen, where you choose what goes in:
//   Panels (side by side, left to right):
//     Picture     the sky picture, as in the player
//     Loupe       the centre (your target), magnified at the loupe's zoom
//     Difference  each picture minus the first one (orange brighter, teal darker), as in F9
//   On top:
//     Predicted track  the F11 ring + dashed path (only when the target has a proper motion)
//     Labels           name, date and frame count
// Your choices are remembered in this browser.
//
// Works for the built-in presets and for anything loaded from a backend (needs the backend
// to allow cross-origin images, which FastAPI's CORS setting does).
// Props: epochs (frames), fps (current speed), title (top label), fileName (download name),
//        track (F11 points per frame as image fractions, or []), zoom (the loupe's zoom)
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { encodeGif } from "../utils/gif";
import { makeIndexedFrames } from "../utils/palette";
import { paintDifference } from "./DifferenceView";
import "../styles/GifExport.css";

const SINGLE_SIZE = 512; // one panel: small images are scaled up (sharp pixels) to about this size
const PANEL_SIZE = 360;  // two or three panels: each about this size
const GAP = 6;           // black gap between panels
const TRACK_COLOUR = "#7dd3fc";
const PREFS_KEY = "minion-yuri-gif-options";
const DEFAULTS = { picture: true, loupe: false, difference: false, track: true, labels: true };

function loadPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private window: fine */ }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous"; // needed to read the pixels
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Could not load " + url));
    im.src = url;
  });
}

// an image's pixels at its own size, plus a grey version (for the difference)
function readPixels(im, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(im, 0, 0, w, h);
  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    throw new Error("The backend doesn't allow its images to be copied (CORS), so a GIF can't be made here.");
  }
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  return { w, h, data, gray };
}

// the part of the image the loupe shows: a square around the centre, 1/zoom of the width
function loupeCrop(zoom) {
  const size = 1 / Math.max(1, zoom);
  return { u0: 0.5 - size / 2, v0: 0.5 - size / 2, size };
}

// F11 ring + path, for a panel at (x, y, S) showing the crop { u0, v0, size } of the image
function drawTrack(ctx, points, i, x, y, S, crop, w0) {
  const at = (p) => [x + ((p.x - crop.u0) / crop.size) * S, y + ((p.y - crop.v0) / crop.size) * S];
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, S, S);
  ctx.clip();
  ctx.strokeStyle = TRACK_COLOUR;
  ctx.fillStyle = TRACK_COLOUR;
  ctx.lineWidth = Math.max(1.5, S / 260);
  if (points.length > 1) {
    ctx.setLineDash([5, 5]);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    points.forEach((p, k) => (k ? ctx.lineTo(...at(p)) : ctx.moveTo(...at(p))));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
  const pxOnPanel = S / (crop.size * w0);                // one SPHEREx pixel on this panel
  const r = Math.max(9, 3.5 * pxOnPanel);
  const [cx, cy] = at(points[i]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

async function makeGif({ epochs, fps, title, opts, track, zoom }, onProgress) {
  const panels = ["picture", "loupe", "difference"].filter((p) => opts[p]);
  const images = [];
  for (let i = 0; i < epochs.length; i++) {
    onProgress(`Loading ${i + 1}/${epochs.length}…`);
    images.push(await loadImage(epochs[i].png_url));
  }

  const w0 = images[0].naturalWidth;
  const h0 = images[0].naturalHeight;
  const want = panels.length > 1 ? PANEL_SIZE : SINGLE_SIZE;
  const S = Math.max(1, Math.round(want / Math.max(w0, h0))) * Math.max(w0, h0); // panel size, whole-pixel scale
  const W = panels.length * S + (panels.length - 1) * GAP;
  const H = S;
  const font = Math.max(11, Math.round(Math.min(S, 512) / 34));
  const pad = Math.round(font * 0.8);
  const crop = loupeCrop(zoom);
  const full = { u0: 0, v0: 0, size: 1 };
  const showTrack = opts.track && track?.length === epochs.length;

  // the difference panel needs every picture's pixels at the first one's size
  let pixels = null;
  if (opts.difference) {
    onProgress("Working out the differences…");
    pixels = images.map((im) => readPixels(im, w0, h0));
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const scratch = document.createElement("canvas"); // difference picture at native size
  scratch.width = w0;
  scratch.height = h0;
  const sctx = scratch.getContext("2d");

  function label(text, x, y, align = "left") {
    ctx.font = `600 ${font}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 3;
    ctx.fillStyle = "#fff";
    ctx.fillText(text, align === "right" ? x - ctx.measureText(text).width : x, y);
    ctx.shadowBlur = 0;
  }

  const rgbaFrames = [];
  let colour = false; // any pixel that isn't grey -> keep colours (false colour, difference, track)
  for (let i = 0; i < images.length; i++) {
    onProgress(`Making frame ${i + 1}/${images.length}…`);
    ctx.imageSmoothingEnabled = false; // keep pixels sharp, 1–2 pixel moves must stay visible
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    panels.forEach((panel, k) => {
      const x = k * (S + GAP);
      if (panel === "picture") {
        ctx.drawImage(images[i], x, 0, S, S);
        if (showTrack) drawTrack(ctx, track, i, x, 0, S, full, w0);
      } else if (panel === "loupe") {
        ctx.drawImage(images[i], crop.u0 * w0, crop.v0 * h0, crop.size * w0, crop.size * h0, x, 0, S, S);
        if (showTrack) drawTrack(ctx, track, i, x, 0, S, crop, w0);
        if (opts.labels) label(`Loupe ${zoom.toFixed(1)}×`, x + pad, pad + font);
      } else if (panel === "difference") {
        const out = sctx.createImageData(w0, h0);
        paintDifference(pixels[0], pixels[i], out.data);
        sctx.putImageData(out, 0, 0);
        ctx.drawImage(scratch, x, 0, S, S);
        if (opts.labels) label(i === 0 ? "Difference: first picture" : `Difference vs ${epochs[0].date}`, x + pad, pad + font);
      }
    });

    // labels: what it is (top) and when (bottom), like the player
    if (opts.labels) {
      if (panels[0] === "picture") label(title, pad, pad + font);
      label(epochs[i].date, pad, H - pad);
      label(`${i + 1}/${images.length}`, W - pad, H - pad, "right");
    }

    const rgba = ctx.getImageData(0, 0, W, H).data;
    if (!colour) {
      for (let q = 0; q < rgba.length; q += 4) {
        if (Math.abs(rgba[q] - rgba[q + 1]) > 2 || Math.abs(rgba[q + 1] - rgba[q + 2]) > 2) { colour = true; break; }
      }
    }
    rgbaFrames.push(rgba);
    await new Promise((r) => setTimeout(r)); // let the page breathe between frames
  }

  const delay = Math.round(100 / fps);
  if (colour) {
    // colour: pick the 256 best colours for this GIF
    onProgress("Picking colours…");
    await new Promise((r) => setTimeout(r));
    const { frames, palette } = makeIndexedFrames(rgbaFrames);
    onProgress("Saving…");
    return encodeGif(frames, W, H, delay, palette);
  }

  // black and white: 256 greys, exact
  const frames = rgbaFrames.map((rgba) => {
    const grey = new Uint8Array(W * H);
    for (let p = 0, q = 0; p < grey.length; p++, q += 4) {
      grey[p] = Math.round(0.299 * rgba[q] + 0.587 * rgba[q + 1] + 0.114 * rgba[q + 2]);
    }
    return grey;
  });
  onProgress("Saving…");
  return encodeGif(frames, W, H, delay);
}

const PANEL_CHOICES = [
  { id: "picture", label: "Picture", tip: "The sky picture, as in the player" },
  { id: "loupe", label: "Loupe", tip: "The centre (your target), magnified" },
  { id: "difference", label: "Difference", tip: "Each picture minus the first: orange brighter, teal darker" },
];

function GifOptions({ opts, setOpts, hasTrack, zoom, fps, frames, onMake, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id) => setOpts({ ...opts, [id]: !opts[id] });
  const nPanels = PANEL_CHOICES.filter((p) => opts[p.id]).length;

  // rendered at the page root so the play row's styles don't leak in
  return createPortal(
    <div className="gif-dialog-backdrop" onClick={onClose}>
      <div className="gif-dialog" role="dialog" aria-modal="true" aria-labelledby="gif-dialog-title"
        onClick={(e) => e.stopPropagation()}>
        <h3 id="gif-dialog-title">Make a GIF</h3>
        <p className="gif-dialog-sub">{frames} pictures at {fps} fps. Pick what goes in.</p>

        <fieldset>
          <legend>Panels, side by side</legend>
          <div className="gif-panels">
            {PANEL_CHOICES.map((p) => (
              <label key={p.id} className={`gif-choice ${opts[p.id] ? "is-on" : ""}`} data-tip={p.tip}>
                <input type="checkbox" checked={opts[p.id]} onChange={() => toggle(p.id)} />
                <span className="gif-choice-name">{p.label}</span>
                <span className="gif-choice-note">
                  {p.id === "loupe" ? `${zoom.toFixed(1)}× on the centre` : p.id === "difference" ? "vs the first picture" : "the full view"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>On top</legend>
          <label className="gif-check" data-tip={hasTrack ? "The ring and dashed path from the player" : "Only for a target with a known proper motion (a preset or a searched star name)"}>
            <input type="checkbox" checked={hasTrack && opts.track} disabled={!hasTrack} onChange={() => toggle("track")} />
            Predicted track{!hasTrack && " (none for this view)"}
          </label>
          <label className="gif-check">
            <input type="checkbox" checked={opts.labels} onChange={() => toggle("labels")} />
            Labels: name, date, frame count
          </label>
        </fieldset>

        <div className="gif-dialog-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="active" onClick={onMake} disabled={nPanels === 0}>
            {nPanels === 0 ? "Pick a panel" : `Make GIF (${nPanels} panel${nPanels > 1 ? "s" : ""})`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function GifExport({ epochs, fps, title, fileName, track = [], zoom = 2.5 }) {
  const [status, setStatus] = useState(null); // null = idle, or a progress / error text
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [opts, setOptsState] = useState(loadPrefs);
  const hasTrack = track.length === epochs.length && track.length > 0;
  const setOpts = (o) => { setOptsState(o); savePrefs(o); };

  async function exportGif() {
    setOpen(false);
    setBusy(true);
    setStatus(null);
    try {
      const bytes = await makeGif({ epochs, fps, title, opts: { ...opts, track: hasTrack && opts.track }, track, zoom }, setStatus);
      const url = URL.createObjectURL(new Blob([bytes], { type: "image/gif" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus("GIF saved ✓");
      setTimeout(() => setStatus(null), 2500);
    } catch (err) {
      setStatus(err.message || "Could not make the GIF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gif-export">
      <button
        onClick={() => setOpen(true)}
        disabled={busy || epochs.length < 2}
        data-tip={`Download this loop as an animated GIF at ${fps} fps; choose loupe, difference and track first`}
      >
        {busy ? "Making GIF…" : "⬇ GIF"}
      </button>
      {status && <span className="gif-status" role="status">{status}</span>}
      {open && (
        <GifOptions opts={opts} setOpts={setOpts} hasTrack={hasTrack} zoom={zoom} fps={fps}
          frames={epochs.length} onMake={exportGif} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

export default GifExport;

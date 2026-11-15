// "Export GIF" button: turns the frames that are playing into an animated GIF and downloads it.
// Works for the built-in presets and for anything loaded from a backend (needs the backend
// to allow cross-origin images, which FastAPI's CORS setting does).
// Props: epochs (frames), fps (current speed), title (top label), fileName (download name)
import { useState } from "react";
import { encodeGif } from "../utils/gif";

const TARGET_SIZE = 512; // small images are scaled up (sharp pixels) to about this size

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous"; // needed to read the pixels
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Could not load " + url));
    im.src = url;
  });
}

async function makeGif(epochs, fps, title, onProgress) {
  const images = [];
  for (let i = 0; i < epochs.length; i++) {
    onProgress(`Loading ${i + 1}/${epochs.length}…`);
    images.push(await loadImage(epochs[i].png_url));
  }

  const w0 = images[0].naturalWidth;
  const h0 = images[0].naturalHeight;
  const scale = Math.max(1, Math.round(TARGET_SIZE / Math.max(w0, h0)));
  const W = w0 * scale;
  const H = h0 * scale;
  const font = Math.max(11, Math.round(W / 34));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const frames = [];
  for (let i = 0; i < images.length; i++) {
    onProgress(`Making frame ${i + 1}/${images.length}…`);
    ctx.imageSmoothingEnabled = false; // keep pixels sharp, 1–2 pixel moves must stay visible
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(images[i], 0, 0, W, H);

    // labels: what it is (top) and when (bottom), like the player
    ctx.font = `600 ${font}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 3;
    ctx.fillStyle = "#fff";
    const pad = Math.round(font * 0.8);
    ctx.fillText(title, pad, pad + font);
    ctx.fillText(epochs[i].date, pad, H - pad);
    const count = `${i + 1}/${images.length}`;
    ctx.fillText(count, W - pad - ctx.measureText(count).width, H - pad);
    ctx.shadowBlur = 0;

    // canvas pixels -> grey values for the GIF palette
    let rgba;
    try {
      rgba = ctx.getImageData(0, 0, W, H).data;
    } catch {
      throw new Error("The backend doesn't allow its images to be copied (CORS), so a GIF can't be made here.");
    }
    const grey = new Uint8Array(W * H);
    for (let p = 0, q = 0; p < grey.length; p++, q += 4) {
      grey[p] = Math.round(0.299 * rgba[q] + 0.587 * rgba[q + 1] + 0.114 * rgba[q + 2]);
    }
    frames.push(grey);
    await new Promise((r) => setTimeout(r)); // let the page breathe between frames
  }

  onProgress("Saving…");
  return encodeGif(frames, W, H, Math.round(100 / fps));
}

function GifExport({ epochs, fps, title, fileName }) {
  const [status, setStatus] = useState(null); // null = idle, or a progress / error text
  const [busy, setBusy] = useState(false);

  async function exportGif() {
    setBusy(true);
    setStatus(null);
    try {
      const bytes = await makeGif(epochs, fps, title, setStatus);
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
        onClick={exportGif}
        disabled={busy || epochs.length < 2}
        data-tip={`Download this loop as an animated GIF at ${fps} fps, to share or put in a slide`}
      >
        {busy ? "Making GIF…" : "⬇ GIF"}
      </button>
      {status && <span className="gif-status" role="status">{status}</span>}
    </div>
  );
}

export default GifExport;

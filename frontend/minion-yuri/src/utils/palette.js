// Picks the 256 best colours for a GIF from all its frames (median cut), then maps
// every pixel to its nearest palette colour. Used for false-colour GIFs; black-and-white
// GIFs don't need it (they use 256 greys, which is exact).
//
//   makeIndexedFrames(rgbaFrames) -> { frames: [Uint8Array], palette: Uint8Array(768) }

const bin = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3); // 32 levels per channel

export function makeIndexedFrames(rgbaFrames) {
  // 1. how often each colour occurs
  const hist = new Uint32Array(32768);
  for (const px of rgbaFrames) {
    for (let q = 0; q < px.length; q += 4) hist[bin(px[q], px[q + 1], px[q + 2])]++;
  }
  const colours = [];
  for (let k = 0; k < 32768; k++) {
    if (hist[k]) colours.push({ c: [(k >> 10) & 31, (k >> 5) & 31, k & 31], n: hist[k], k });
  }

  // 2. median cut: keep splitting the box with the widest colour range
  let boxes = [colours];
  while (boxes.length < 256) {
    let best = -1, bestRange = 0, bestAxis = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let a = 0; a < 3; a++) {
        let lo = 31, hi = 0;
        for (const x of box) { if (x.c[a] < lo) lo = x.c[a]; if (x.c[a] > hi) hi = x.c[a]; }
        if (hi - lo > bestRange) { bestRange = hi - lo; best = i; bestAxis = a; }
      }
    });
    if (best < 0) break; // every box is a single colour
    const box = boxes[best].sort((p, q) => p.c[bestAxis] - q.c[bestAxis]);
    const total = box.reduce((s, x) => s + x.n, 0);
    let acc = 0, cut = 1;
    for (let i = 0; i < box.length - 1; i++) { acc += box[i].n; if (acc >= total / 2) { cut = i + 1; break; } }
    boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
  }

  // 3. one palette colour per box (weighted average), 5-bit -> 8-bit
  const palette = new Uint8Array(768);
  const pal = boxes.map((box, i) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const x of box) { r += x.c[0] * x.n; g += x.c[1] * x.n; b += x.c[2] * x.n; n += x.n; }
    const rgb = [r / n, g / n, b / n].map((v) => Math.round((v * 255) / 31));
    palette.set(rgb, i * 3);
    return rgb;
  });

  // 4. every used colour -> nearest palette colour
  const lut = new Uint8Array(32768);
  for (const { c, k } of colours) {
    const r = (c[0] * 255) / 31, g = (c[1] * 255) / 31, b = (c[2] * 255) / 31;
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const d = (pal[i][0] - r) ** 2 + (pal[i][1] - g) ** 2 + (pal[i][2] - b) ** 2;
      if (d < bestD) { bestD = d; bestI = i; }
    }
    lut[k] = bestI;
  }

  const frames = rgbaFrames.map((px) => {
    const out = new Uint8Array(px.length / 4);
    for (let p = 0, q = 0; p < out.length; p++, q += 4) out[p] = lut[bin(px[q], px[q + 1], px[q + 2])];
    return out;
  });
  return { frames, palette };
}

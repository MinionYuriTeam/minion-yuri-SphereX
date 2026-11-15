// Tiny animated-GIF encoder (no npm package needed).
//
//   encodeGif(frames, width, height, delayCs, palette) -> Uint8Array (the .gif file)
//   frames  = array of Uint8Array, one palette index (0–255) per pixel, row by row
//   delayCs = time per frame in hundredths of a second (50 = 2 frames per second)
//   palette = 256 colours as [r,g,b, r,g,b, ...] (768 numbers). Left out = 256 greys,
//             so for black-and-white frames the index is simply the grey value.

export function encodeGif(frames, width, height, delayCs, palette = null) {
  const out = [];
  const byte = (b) => out.push(b & 255);
  const word = (w) => { byte(w); byte(w >> 8); };
  const text = (s) => { for (const c of s) byte(c.charCodeAt(0)); };

  // header + screen: 256-colour global palette (0xF7)
  text("GIF89a");
  word(width);
  word(height);
  byte(0xf7);
  byte(0);
  byte(0);
  for (let i = 0; i < 256; i++) {
    if (palette) { byte(palette[i * 3] || 0); byte(palette[i * 3 + 1] || 0); byte(palette[i * 3 + 2] || 0); }
    else { byte(i); byte(i); byte(i); } // grey ramp
  }

  // loop forever
  byte(0x21); byte(0xff); byte(11); text("NETSCAPE2.0"); byte(3); byte(1); word(0); byte(0);

  for (const pixels of frames) {
    // frame delay
    byte(0x21); byte(0xf9); byte(4); byte(0x04); word(delayCs); byte(0); byte(0);
    // image block, full size, no local palette
    byte(0x2c); word(0); word(0); word(width); word(height); byte(0);
    byte(8); // LZW minimum code size
    const data = lzw(pixels, 8);
    for (let i = 0; i < data.length; i += 255) {
      const n = Math.min(255, data.length - i);
      byte(n);
      for (let j = 0; j < n; j++) out.push(data[i + j]);
    }
    byte(0);
  }
  byte(0x3b); // end of file
  return new Uint8Array(out);
}

// GIF flavour of LZW compression
function lzw(pixels, minCodeSize) {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const out = [];
  let codeSize = minCodeSize + 1;
  let next = end + 1;
  let dict = new Map();
  let acc = 0;
  let bits = 0;

  const emit = (code) => {
    acc |= code << bits;
    bits += codeSize;
    while (bits >= 8) { out.push(acc & 255); acc >>>= 8; bits -= 8; }
  };

  emit(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      // dictionary full: start over
      emit(clear);
      dict = new Map();
      codeSize = minCodeSize + 1;
      next = end + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(end);
  if (bits > 0) out.push(acc & 255);
  return out;
}

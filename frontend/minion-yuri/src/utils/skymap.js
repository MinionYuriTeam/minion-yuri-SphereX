// Sky map maths (pages/SkyMap.js): the whole sky from IRSA's SPHEREx DR1 all-sky map.
//
// IRSA publishes the map as a HiPS "cube": 102 frames, one per SPHEREx wavelength.
// For each frame, Norder3/Allsky_<frame>.png holds the whole sky in one picture:
// 768 HEALPix tiles of 64×64 pixels, 27 tiles per row (about 7′ per pixel).
// We project it ourselves (no Aladin), in galactic coordinates so the Milky Way
// runs straight across the middle, with a Mollweide (equal-area oval) map.
//
// Tile orientation inside the Allsky picture was checked by rendering all 8
// possibilities: only "column = HEALPix y, row = HEALPix x" gives a smooth sky.

export const HIPS_URL = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube";
const TILE = 64;                    // tile size in Norder3/Allsky
const ORDER = 3;
const NSIDE_T = 1 << ORDER;         // tiles per HEALPix face side
const NSIDE = NSIDE_T * TILE;       // HEALPix nside of one Allsky pixel
export const ALLSKY_COLS = 27;
export const ALLSKY_W = ALLSKY_COLS * TILE;                  // 1728
export const ALLSKY_H = Math.ceil(768 / ALLSKY_COLS) * TILE; // 1856

// Wavelength of each frame in µm (from the HiPS properties). Frame = 17 × (array − 1) + channel − 1.
export const WAVELENGTHS = [
  0.753, 0.771, 0.790, 0.809, 0.828, 0.848, 0.868, 0.889, 0.910, 0.932, 0.955, 0.978, 1.001, 1.025, 1.050, 1.075, 1.102,
  1.113, 1.139, 1.167, 1.195, 1.224, 1.254, 1.284, 1.315, 1.346, 1.378, 1.412, 1.446, 1.481, 1.517, 1.554, 1.592,
  1.631, 1.656, 1.695, 1.735, 1.775, 1.818, 1.861, 1.905, 1.949, 1.995, 2.041, 2.089, 2.139, 2.189, 2.240, 2.292,
  2.345, 2.399, 2.445, 2.506, 2.575, 2.646, 2.719, 2.794, 2.871, 2.951, 3.033, 3.118, 3.204, 3.293, 3.383, 3.476,
  3.570, 3.667, 3.768, 3.833, 3.867, 3.901, 3.935, 3.970, 4.005, 4.040, 4.076, 4.112, 4.148, 4.184, 4.220, 4.257,
  4.294, 4.331, 4.368, 4.405, 4.435, 4.467, 4.500, 4.533, 4.566, 4.600, 4.635, 4.669, 4.704, 4.739, 4.773, 4.808,
  4.843, 4.879, 4.915, 4.951, 4.988,
];
const BLANK = new Set([50, 51]); // the dichroic channels (array 3 ch 17, array 4 ch 1) are empty
export const FRAMES = WAVELENGTHS.map((_, i) => i).filter((i) => !BLANK.has(i));
export const arrayOfFrame = (f) => Math.floor(f / 17) + 1;
export const allskyUrl = (f) => `${HIPS_URL}/Norder3/${f === 0 ? "Allsky.png" : `Allsky_${f}.png`}`;
// the frame closest to a wavelength (skipping blank ones)
export const frameNear = (um) => FRAMES.reduce((best, f) =>
  Math.abs(WAVELENGTHS[f] - um) < Math.abs(WAVELENGTHS[best] - um) ? f : best, FRAMES[0]);

// ---------- HEALPix (nested), from the standard ang2pix algorithm ----------
// z = sin(dec), phi = ra in radians -> { face, ix, iy } at NSIDE
function ang2xyf(z, phi) {
  const za = Math.abs(z);
  let tt = (phi / (Math.PI / 2)) % 4;
  if (tt < 0) tt += 4;
  if (za <= 2 / 3) {
    const t1 = NSIDE * (0.5 + tt), t2 = NSIDE * z * 0.75;
    const jp = Math.floor(t1 - t2), jm = Math.floor(t1 + t2);
    const ifp = Math.floor(jp / NSIDE), ifm = Math.floor(jm / NSIDE);
    const face = ifp === ifm ? (ifp | 4) : ifp < ifm ? ifp : ifm + 8;
    return { face, ix: jm & (NSIDE - 1), iy: NSIDE - (jp & (NSIDE - 1)) - 1 };
  }
  const ntt = Math.min(3, Math.floor(tt)), tp = tt - ntt;
  const tmp = NSIDE * Math.sqrt(3 * (1 - za));
  const jp = Math.min(Math.floor(tp * tmp), NSIDE - 1);
  const jm = Math.min(Math.floor((1 - tp) * tmp), NSIDE - 1);
  return z >= 0
    ? { face: ntt, ix: NSIDE - jm - 1, iy: NSIDE - jp - 1 }
    : { face: ntt + 8, ix: jp, iy: jm };
}
const spread = (v) => { let out = 0; for (let b = 0; b < 8; b++) out |= ((v >> b) & 1) << (2 * b); return out; };

// RA/Dec in degrees -> index of that sky spot's pixel in the Allsky picture (row-major)
export function allskyIndex(ra, dec) {
  const { face, ix, iy } = ang2xyf(Math.sin(dec * RAD), ra * RAD);
  const tx = ix >> 6, ty = iy >> 6;                       // tile inside the face (64 = TILE)
  const tile = face * NSIDE_T * NSIDE_T + spread(tx) + (spread(ty) << 1);
  const col = (tile % ALLSKY_COLS) * TILE + (iy & (TILE - 1));
  const row = Math.floor(tile / ALLSKY_COLS) * TILE + (ix & (TILE - 1));
  return row * ALLSKY_W + col;
}

// ---------- equatorial <-> galactic (J2000 / ICRS) ----------
const RAD = Math.PI / 180;
const G = [ // equatorial -> galactic rotation
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
];
const vec = (lon, lat) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
function angles([x, y, z]) {
  const lon = Math.atan2(y, x) / RAD;
  return [(lon + 360) % 360, Math.asin(Math.max(-1, Math.min(1, z))) / RAD];
}
export function equatorialToGalactic(ra, dec) {
  const v = vec(ra, dec);
  const [l, b] = angles(G.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]));
  return { l, b };
}
export function galacticToEquatorial(l, b) {
  const v = vec(l, b);
  const [ra, dec] = angles([0, 1, 2].map((i) => G[0][i] * v[0] + G[1][i] * v[1] + G[2][i] * v[2]));
  return { ra, dec };
}

// ---------- Mollweide, galactic centre in the middle, longitude increasing to the LEFT ----------
// map coordinates u, v are fractions of the map's width / height (0..1, top-left origin)
const S2 = Math.SQRT2;
export function mollweideInverse(u, v) {
  const x = (0.5 - u) * 4 * S2;        // minus: longitude increases to the left
  const y = (0.5 - v) * 2 * S2;
  if ((x / (2 * S2)) ** 2 + (y / S2) ** 2 >= 1) return null; // outside the oval
  const th = Math.asin(y / S2);
  const b = Math.asin((2 * th + Math.sin(2 * th)) / Math.PI) / RAD;
  const l = ((Math.PI * x) / (2 * S2 * Math.cos(th))) / RAD;
  return { l: (l + 360) % 360, b };
}
export function mollweideForward(l, b) {
  const lon = (((l + 180) % 360) + 360) % 360 - 180; // -180..180, 0 = galactic centre
  const lat = b * RAD;
  let th = lat;
  for (let i = 0; i < 30; i++) { // Newton: 2θ + sin 2θ = π sin(lat)
    const f = 2 * th + Math.sin(2 * th) - Math.PI * Math.sin(lat);
    const d = 2 + 2 * Math.cos(2 * th);
    if (Math.abs(d) < 1e-12) break;
    th -= f / d;
    if (Math.abs(f) < 1e-10) break;
  }
  const x = ((2 * S2) / Math.PI) * lon * RAD * Math.cos(th);
  const y = S2 * Math.sin(th);
  return { u: 0.5 - x / (4 * S2), v: 0.5 - y / (2 * S2) };
}

// For a map of W × H pixels: which Allsky pixel each map pixel shows (-1 = outside the oval)
export function buildLookup(W, H) {
  const lut = new Int32Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const g = mollweideInverse((x + 0.5) / W, (y + 0.5) / H);
      if (!g) continue;
      const { ra, dec } = galacticToEquatorial(g.l, g.b);
      lut[y * W + x] = allskyIndex(ra, dec);
    }
  }
  return lut;
}

// The ONLY place that talks to the backend. Components never fetch themselves.
// USE_MOCK = true  -> reads public/mock/frames.json
// USE_MOCK = false -> calls Axe's API (put his URL in API_URL)
const USE_MOCK = true;
const API_URL = 'http://localhost:8000';

// GET /api/frames?ra=&dec=&fov=&array=
// -> { array, wavelength_um: [lo, hi], epochs: [ { date, n_exposures, png_url, flags_png_url } ] }
export async function getFrames({ ra, dec, fov, array }) {
  const url = USE_MOCK
    ? '/mock/frames.json'
    : `${API_URL}/api/frames?ra=${ra}&dec=${dec}&fov=${fov}&array=${array}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load the sky images.');
  return res.json();
}

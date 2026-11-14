// The ONLY place that talks to the backend. Components never fetch themselves.
//
// Settings (put them in frontend/minion-yuri/.env.local, then restart npm start):
//   REACT_APP_API_URL=http://localhost:8000   where the backend runs (default)
//   REACT_APP_USE_MOCK=true                   use public/mock/frames.json instead
const API_URL = (process.env.REACT_APP_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const USE_MOCK = process.env.REACT_APP_USE_MOCK === 'true';

// GET /api/frames?ra=&dec=&fov=&array=
// -> { array, wavelength_um: [lo, hi], epochs: [ { date, n_exposures, png_url, flags_png_url } ], ... }
// The first request for a new spot can take up to a minute (the backend downloads
// from NASA's archive); after that it is cached and takes a few seconds.
export async function getFrames({ ra, dec, fov, array }, { signal } = {}) {
  const url = USE_MOCK
    ? '/mock/frames.json'
    : `${API_URL}/api/frames?${new URLSearchParams({ ra, dec, fov, array })}`;
  return getJson(url, signal, 'Could not load the sky images.');
}

// GET /api/resolve?name=
// Takes a name ("Barnard's Star"), decimal ("269.45 4.69") or sexagesimal
// ("08h55m10.8s -07d14m42s") -> { ra, dec, ra_now, dec_now, pm_ra_mas_yr, pm_dec_mas_yr, name }
// ra_now/dec_now = where the object is today (fast stars have moved since 2000).
export async function resolveName(name, { signal } = {}) {
  const url = `${API_URL}/api/resolve?${new URLSearchParams({ name })}`;
  return getJson(url, signal, 'Could not look that up.');
}

async function getJson(url, signal, fallbackMessage) {
  let res;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(`${fallbackMessage} Is the backend running at ${API_URL}?`);
  }
  if (!res.ok) {
    // the backend explains what went wrong in { detail: "..." }
    const body = await res.json().catch(() => ({}));
    const error = new Error(typeof body.detail === 'string' ? body.detail : fallbackMessage);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export { API_URL, USE_MOCK };

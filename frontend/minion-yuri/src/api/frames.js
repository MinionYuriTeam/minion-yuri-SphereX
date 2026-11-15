// The ONLY place that talks to the backend. Components never fetch themselves.
//
// Where frames come from:
//   1. The 5 test targets are BAKED into the site (public/baked/, made by
//      backend/bake.py), so they play without any backend.
//   2. Everything else comes from a backend: by default the visitor's own,
//      running on their computer at http://localhost:8000. If none is running,
//      getFrames() throws an error with code 'NO_BACKEND' and the app explains
//      how to start one.
//
// Choosing the backend (first match wins):
//   - ?api=https://... in the page URL (remembered in this browser;
//     ?api=default forgets it again)
//   - REACT_APP_API_URL at build time (.env.local, Vercel env vars)
//   - http://localhost:8000
//
// REACT_APP_USE_MOCK=true serves public/mock/frames.json instead (for UI work).
const PUBLIC = process.env.PUBLIC_URL || '';
const DEFAULT_API = (process.env.REACT_APP_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const USE_MOCK = process.env.REACT_APP_USE_MOCK === 'true';
const STORAGE_KEY = 'minion-yuri-api-url';

export function getApiUrl() {
  const fromUrl = new URLSearchParams(window.location.search).get('api');
  try {
    if (fromUrl === 'default') localStorage.removeItem(STORAGE_KEY);
    else if (fromUrl) localStorage.setItem(STORAGE_KEY, fromUrl.replace(/\/$/, ''));
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_API;
  } catch {
    return fromUrl && fromUrl !== 'default' ? fromUrl.replace(/\/$/, '') : DEFAULT_API;
  }
}

// GET frames for one view: baked if we have it, otherwise from the backend.
// -> { array, wavelength_um: [lo, hi], epochs: [ { date, n_exposures, png_url, flags_png_url } ],
//      source: 'baked' | 'backend', ... }
// job = any id: the backend keeps this request's download log under it (see getProgress)
export async function getFrames({ ra, dec, fov, array }, { signal, job } = {}) {
  if (USE_MOCK) return getJson(`${PUBLIC}/mock/frames.json`, signal, 'Could not load the mock data.');

  const baked = await findBaked({ ra, dec, fov, array });
  if (baked) {
    const json = await getJson(`${PUBLIC}/${baked}`, signal, 'Could not load the built-in images.');
    const site = (path) => (path ? `${PUBLIC}/${path}` : null);
    json.epochs = json.epochs.map((e) => ({ ...e, png_url: site(e.png_url), flags_png_url: site(e.flags_png_url) }));
    return { ...json, source: 'baked' };
  }

  const api = getApiUrl();
  const json = await getJson(
    `${api}/api/frames?${new URLSearchParams({ ra, dec, fov, array, ...(job ? { job } : {}) })}`,
    signal,
    'Could not load the sky images.',
    api
  );
  return { ...json, source: 'backend' };
}

// GET /api/resolve?name= (needs a backend)
// Takes a name ("Barnard's Star"), decimal ("269.45 4.69") or sexagesimal
// ("08h55m10.8s -07d14m42s") -> { ra, dec, ra_now, dec_now, pm_ra_mas_yr, pm_dec_mas_yr, name }
// ra_now/dec_now = where the object is today (fast stars have moved since 2000).
export async function resolveName(name, { signal } = {}) {
  const api = getApiUrl();
  return getJson(`${api}/api/resolve?${new URLSearchParams({ name })}`, signal, 'Could not look that up.', api);
}

// False colour: three detector arrays as the red, green and blue of one picture.
// GET /api/rgb?ra=&dec=&fov=&arrays=6,4,2 (baked for the test targets)
// -> { arrays: [r, g, b], fov, epochs: [ { date, png_url } ], source }
export async function getRgb({ ra, dec, fov, arrays = [6, 4, 2] }, { signal, job } = {}) {
  const target = await findBakedTarget(ra, dec);
  const combo = target?.rgb?.find((c) => c.fov === Number(fov) && c.arrays.join() === arrays.join());
  if (combo) {
    const json = await getJson(`${PUBLIC}/${combo.path}`, signal, 'Could not load the built-in colour images.');
    json.epochs = json.epochs.map((e) => ({ ...e, png_url: `${PUBLIC}/${e.png_url}` }));
    return { ...json, source: 'baked' };
  }
  const api = getApiUrl();
  const json = await getJson(
    `${api}/api/rgb?${new URLSearchParams({ ra, dec, fov, arrays: arrays.join(','), ...(job ? { job } : {}) })}`,
    signal,
    'Could not load the colour images.',
    api
  );
  return { ...json, source: 'backend' };
}

// The download log of a request sent with { job }, while it runs (the loading screen shows it).
// GET /api/progress?job=&since= -> { lines, next, fetch: { what, done, failed, total, mb } | null, done }
// Returns null if there's no backend, or an older one without this endpoint.
export async function getProgress(job, since = 0, { signal } = {}) {
  try {
    const res = await fetch(`${getApiUrl()}/api/progress?${new URLSearchParams({ job, since })}`, { signal });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

// a fresh id for one request's download log
export function newJobId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// Is the spectrum of this spot baked into the site? (then it loads instantly)
export async function hasBakedSpectrum(ra, dec) {
  return Boolean((await findBakedTarget(ra, dec))?.spectrum);
}

// Spectrum: one point per exposure, all six arrays.
// GET /api/spectrum?ra=&dec=&pm_ra=&pm_dec= (baked for the test targets)
// -> { points: [ { wavelength_um, bandwidth_um, flux_mjy, error_mjy, array, array_range_um,
//                  date, visit, quality } ], n_exposures, n_dropped, source }
// Always unbinned: SpectrumChart bins on the client (same rule as the backend's binned=true).
export async function getSpectrum({ ra, dec, pm_ra = 0, pm_dec = 0 }, { signal } = {}) {
  const target = await findBakedTarget(ra, dec);
  if (target?.spectrum) {
    const json = await getJson(`${PUBLIC}/${target.spectrum}`, signal, 'Could not load the built-in spectrum.');
    return { ...json, source: 'baked' };
  }
  const api = getApiUrl();
  const json = await getJson(
    `${api}/api/spectrum?${new URLSearchParams({ ra, dec, pm_ra, pm_dec })}`,
    signal,
    'Could not measure the spectrum.',
    api
  );
  return { ...json, source: 'backend' };
}

async function findBakedTarget(ra, dec) {
  const index = await getBakedIndex();
  return index.targets.find(
    (t) => Math.abs(t.ra - Number(ra)) < 1e-6 && Math.abs(t.dec - Number(dec)) < 1e-6
  );
}

// Which target / array / field of view is baked: public/baked/index.json
let bakedIndex = null;
export function getBakedIndex() {
  if (!bakedIndex) {
    bakedIndex = fetch(`${PUBLIC}/baked/index.json`)
      .then((r) => (r.ok ? r.json() : { targets: [] }))
      .catch(() => ({ targets: [] }));
  }
  return bakedIndex;
}

async function findBaked({ ra, dec, fov, array }) {
  const target = await findBakedTarget(ra, dec);
  const combo = target?.baked.find((c) => c.array === Number(array) && c.fov === Number(fov));
  return combo ? combo.path : null;
}

async function getJson(url, signal, fallbackMessage, api) {
  let res;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // the request never reached a server: no backend running at `api`
    // (or the browser blocked it, e.g. Safari from an https page)
    const error = new Error(api ? `No backend answered at ${api}.` : fallbackMessage);
    if (api) {
      error.code = 'NO_BACKEND';
      error.api = api;
    }
    throw error;
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

export { USE_MOCK };

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
export async function getFrames({ ra, dec, fov, array }, { signal } = {}) {
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
    `${api}/api/frames?${new URLSearchParams({ ra, dec, fov, array })}`,
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
  const index = await getBakedIndex();
  const target = index.targets.find(
    (t) => Math.abs(t.ra - Number(ra)) < 1e-6 && Math.abs(t.dec - Number(dec)) < 1e-6
  );
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

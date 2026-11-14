# Changelog

Newest first. One entry per piece of work, with the branch it landed on.

## 14 Nov 2026: Frontend connected to the real backend (`frontendApiConnection`)

- **`src/api/frames.js`**: uses the real backend by default. The address comes
  from `REACT_APP_API_URL` (default `http://localhost:8000`); `REACT_APP_USE_MOCK=true`
  brings back the mock. New `resolveName()` for `/api/resolve`. Requests can be
  cancelled, and the backend's error message (`detail`) is shown to the user.
  `.env.example` documents both settings.
- **`App.js`**: loading screen with a seconds counter (first visits take up to a
  minute), error screen with **Try again**, older requests cancelled when the
  view changes, field of view still reachable while loading, the detector array
  wired into the view and URL.
- **`SearchBar.js`**: presets and decimal `RA, Dec` stay instant; any other name
  and sexagesimal coordinates go to `/api/resolve`, using today's position.
- **`BandPicker.js`**: was a placeholder; now buttons for arrays 1–6 with
  wavelength ranges, the current exact range from the API (F3/F5 selector).
- **`FovPicker.js`**: added 20′ and 40′ fields of view (Barnard's Star: 195 px /
  391 px; 40′ takes 36 s the first time, ~4 s cached, and skips 13 of 60
  exposures whose square is cut off by a detector edge).
- **`BlinkPlayer.js`**: removed the fake zoom for mock data; clearer message when
  an array has no images.
- **`data/target.js`**: presets moved to today's positions (proper motion
  applied), Epsilon Indi B fixed (it pointed at Epsilon Indi A), and each
  preset opens on its best detector array.
- **Tested in the browser** against the local backend:
  - Barnard's Star preset: real frames, loupe reads pixels, no console errors.
  - WISE 0855 preset: switches to array 6, first-time load with the loading screen.
  - Unknown name: clear message, view unchanged.
  - Sexagesimal search: resolved via the backend and loaded.
  - Array switch while loading: old request cancelled.
  - Backend stopped: error screen; after restart, Try again loads.
  - Phone width: no horizontal scrolling.
- Found why `backend/output/` files kept disappearing: checking out an old
  commit where they were tracked, then a newer one, makes git delete them. Now
  documented in the README.

## 14 Nov 2026: README and frontend–backend connection guide (`frontendApiConnection`)

- **Root `README.md` rewritten** (layout modelled on the Domits README): what the
  project is, tech stack, repository structure, getting started (backend,
  frontend, and how to connect them), how it works (with a diagram), API
  summary, features and owners, test targets, team, contribution guidelines,
  credits.
- **Connection guide:** how to switch the frontend from mock data to the real
  API (`USE_MOCK = false` in `src/api/frames.js`), what to set when deployed
  (`API_URL`, `PUBLIC_BASE_URL`), and a troubleshooting table.
- **Test targets** table with today's positions (proper motion applied) and the
  best detector array for each; flags that the Epsilon Indi B preset points at
  Epsilon Indi A.
- `docs/images/five_targets.png`: the 5 test targets as the API serves them.
- `frontend/readme.md`: the empty template now points to the real frontend README.
- `backend/readme.md`: links back to the root README.

## 14 Nov 2026: Backend Musts (`multipleimages`, merged in PR #5)

- **`backend/pipeline/`**: the data pipeline, split into one file per step:
  search (IRSA SIA2), fetch (small squares from AWS S3 with HTTP range
  requests, IMAGE + FLAGS), grid (north-up alignment), stacks (group by
  visit, median stack, shared brightness range), render (PNGs), resolve
  (names/coordinates), flags (bit meanings).
- **`get_stacks(ra, dec, fov, array)`**: the hand-off to the API: per visit the
  date, number of exposures, image, WCS and flags (F3, F5).
- **`backend/api.py`**: FastAPI with `/api/frames`, `/api/resolve`, `/api/health`;
  PNGs served from `/files/`, CORS open.
- **`/api/resolve`**: names via CDS Sesame (SIMBAD was down), decimal and
  sexagesimal coordinates; returns proper motion and `ra_now`/`dec_now`.
- **F5 check passed:** field stars vary ~3–4% between visits (single exposures
  15–22%, old per-frame stretch 10–36%).
- **All 5 test targets** load through `/api/frames`: 15–45 s first time, 2–8 s
  cached.
- **IRSA reliability:** one direct search request with up to 12 quick retries,
  plus a saved exposure list reused for 6 hours or when IRSA is down.
- **Fixes:** saturated star cores (NaN in SPHEREx data) render white instead of
  black; exposures that can't fill the whole square are skipped instead of
  leaving black corners.
- `backend/epochs.py` is now a short command-line tool on top of the pipeline.
- `backend/output/` is no longer tracked in git (`backend/.gitignore`).

# Changelog

Newest first. One entry per piece of work, with the branch it landed on.

## 14 Nov 2026: Built-in test targets + "run your own backend" (`frontendApiConnection`)

Hugging Face paused our free Space (CPU quota) and Render isn't free, so the
public site (stealingthemoon.earth, Vercel) now works without a hosted backend:

- **`backend/bake.py`**: renders the 5 test targets into
  `frontend/minion-yuri/public/baked/`: every array at 2/5/10′, the best array
  also at 20/40′. It reads the targets from `src/data/target.js`.
- **`backend/pipeline/fetch.py`**: a smaller field of view reuses squares
  already downloaded for a bigger one (Barnard's Star at 3′: 0 downloads,
  identical pixels). While baking, the 5′ and 2′ fields took 2–3 s each instead
  of ~11 s.
- **`backend/api.py`**: `allow_private_network=True`, so a public site may call
  the backend on the visitor's own computer (Chrome's local-network check).
- **`src/api/frames.js`**:
  - built-in files first, otherwise the backend;
  - "no backend" is its own error (`NO_BACKEND`);
  - `?api=` picks another backend and is remembered in the browser.
- **`src/components/RunBackendHelp.js`**: shown when no backend answers: the
  clone/install/start commands with Copy buttons, a Chrome "Allow" tip, a
  Safari warning, and Try again.
- `SearchBar.js`: name lookups explain that they need the backend.

## 14 Nov 2026: Deploy settings in `deploy/.env` (`frontendApiConnection`)

- **`deploy/.env`** (git-ignored via `deploy/.gitignore`, file mode 600) holds
  `HF_USERNAME`, `HF_SPACE`, `HF_TOKEN` and optional `BACKEND_URL`;
  `deploy/.env.example` is the committed template.
- `deploy.sh` and `precache.sh` read it. Empty values are skipped and terminal
  settings win; the file is read as `KEY=value` lines, never run as code.
- The token goes to git through a one-off credential helper: not in the URL,
  git config or keychain, and never printed.
- Tested with fake values: settings picked up, terminal and argument
  overrides work, URL derived from `HF_SPACE`, token handed to git.

## 14 Nov 2026: Backend hosting on Hugging Face Spaces (`frontendApiConnection`)

- **`deploy/huggingface/Dockerfile`**: Python 3.13 container for a Docker
  Space: runs as user 1000, serves on port 7860, trusts the HTTPS proxy
  (`--proxy-headers`) so PNG links are `https://`.
- **`deploy/huggingface/README.md`**: the Space's page (front matter: Docker SDK,
  port 7860) with endpoints and credits.
- **`deploy/huggingface/deploy.sh <user>/<space>`**: clones the Space, replaces
  it with `api.py`, `pipeline/`, `requirements.txt` + Dockerfile, commits, pushes.
- **`deploy/precache.sh <url> [fov ...]`**: loads the 5 presets so they're cached
  (run after each deploy or wake-up).
- **`backend/api.py`**: `/` now redirects to `/docs`, so the Space page shows
  the interactive API docs.
- **Checked without Docker** (no container engine on the dev Mac):
  - Every pinned package has a ready-made Linux build for Python 3.13.
  - The assembled Space folder runs the way the Dockerfile runs it.
  - `/` redirects; a first-time `/api/frames` took 22 s.
  - With a faked HTTPS proxy header, PNG links come back as `https://…hf.space`.
- README: new "Deploy the Backend (Hugging Face)" section.

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

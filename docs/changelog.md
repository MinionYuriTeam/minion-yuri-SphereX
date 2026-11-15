# Changelog

Newest first. One entry per piece of work, with the branch it landed on.

## 15 Nov 2026: 8 more built-in targets, 20 in total (`raman-more-targets`)

- **`public/baked/`**: Wolf 359, 61 Cygni, Teegarden's Star, Ring Nebula,
  Carina Nebula, Eagle Nebula, Flame Nebula and Whirlpool Galaxy, each with
  6 arrays × 5 fields of view, false colour, flags and spectrum. No failed
  downloads. `public/baked` is now 75 MB.
- **README**: counts, picture and table updated to all 20 targets.
- Known gaps: the spectrum is empty for the Carina Nebula and 61 Cygni
  (saturated or flagged at the centre), as for the Orion Nebula.

## 15 Nov 2026: 7 more built-in targets (`raman-more-targets`)

- **`src/data/target.js`**: 7 new targets next to the 5 test targets: Proxima
  Centauri, Kapteyn's Star, Luhman 16, TRAPPIST-1, Orion Nebula, Andromeda
  Galaxy and Crab Nebula. Each has today's position, best array, the "This
  target" text and `aliases` for the search box ("m42", "proxima"). The four
  stars also have a proper-motion track (F11).
- **`public/baked/`**: all 7 baked like the test targets: 6 arrays × 5 fields of
  view, false colour at 5 fields of view, flags and spectrum. No failed
  downloads. `public/baked` is now 46 MB.
- **`backend/bake.py`**: several runs can bake different targets at the same
  time (the index is merged under a lock); new `--small` option (20′ and 40′
  only on the target's own array) for a quick bake.
- **`SearchBar.js`**: also matches a target's `aliases`.
- **`SpotTheMover.js`**: Kapteyn's Star added as a mover (arrays 1–3).
- **`Presets.js`, `RunBackendHelp.js`**: wording no longer says "5 targets".
- **README**: new "Built-in Targets" section with a picture and table of all
  12; feature table shows what is live; API table lists `/api/rgb`,
  `/api/spectrum` and `/api/progress`.
- Tarantula Nebula and Cat's Eye Nebula were started but left out: they have
  about 300 exposures per array and could not finish before the deadline.
- Known gaps: the Orion Nebula spectrum is empty and Kapteyn's Star has 7
  points.
- **No-backend screen (`RunBackendHelp.js`)**: a spot that isn't built in now
  offers the built-in targets as buttons (only those in `baked/index.json`);
  the backend commands are folded under "Want this exact spot?".
- **Flags are never on by default**: the Epsilon Indi B preset no longer turns
  the overlay on (`showFlags` removed from `target.js`); only the flag button
  or `?flags=1` does.
- **Spectrum wording (`SpectrumChart.js`)**: "N clean measurements from M
  exposures"; a spot with no clean measurement explains why; with no backend
  the panel no longer says it will start downloading.
- Tested in the browser: the 12 presets show, Kapteyn's Star and the Orion
  Nebula (false colour, 40′ on array 1) load from the built-in files, the game
  page loads.

## 15 Nov 2026: F15 "Spot the mover" game (`raman-f15-game`)

- **`src/pages/SpotTheMover.js`** (+ `styles/SpotTheMover.css`): a new page
  at `#/game`, linked as "Spot the mover" in the navbar. A random patch of
  sky blinks at 2 fps and the player clicks the star that moves.
  - The patches come from the baked 20′ pictures, so the game works without a
    backend. The movers and their arrays are Barnard's Star (1–3), WISE 0855
    (5–6) and Epsilon Indi B (3).
  - Each patch is a random ~8′ square of the 20′ picture. The square always
    holds the mover's whole track, at least 8 px from the edge. It's randomly
    flipped, so the mover is never just "the one in the middle".
  - Clicks are checked against the catalogue. The page uses the Gaia DR3 or
    SIMBAD position and proper motion, moved to the date of the picture on
    screen (`utils/motion.js`, same as F11). A click within 3 SPHEREx pixels
    (~18″) counts.
  - Up to 3 tries per patch: 100 / 50 / 25 points. After 2 misses, a dashed
    circle shows roughly where to look.
  - When a patch is done, the page shows the predicted track and ring, the
    star's name and how fast it moves, and a link that opens it in the
    explorer.
  - One round is 5 patches, with every mover at least once. It ends with a
    score summary and Play again.
  - Pause / Next picture let the player step through the visits; each picture
    shows its date. Tapping works on phones.
- **`App.js`**: `#/game` added to `PAGES`, plus the navbar link.
- Tested in the browser:
  - Two full rounds played to the score screen; the total matches the clicks.
  - A click 10+ px off says "Not that one"; a click on the predicted spot scores.
  - 3 misses end the patch with 0 points and reveal the answer.
  - The hint circle appears after 2 misses.
  - All 6 star/array patches: the catalogue position is on a source in every
    picture.
  - WISE 0855 is faint (peak ~30–60 of 255 over a ~5–10 background), so it's
    the hard one.
  - Phone width (375 px): no sideways scrolling.
  - No console errors.
  - `CI=true react-scripts build` passes.
## 15 Nov 2026: Sky map: visible loading state (`raman-skymap-loading`)

- **`src/pages/SkyMap.js`** + **`styles/SkyMap.css`**: changing wavelength
  kept the old map at full brightness with grey "Loading…" text on top, so
  you couldn't tell it was loading. Now while a map loads:
  - the old map dims;
  - a dark pill with a spinner says what's loading ("Loading 1.59 µm from
    IRSA…", "Loading the colour map from IRSA…"), above the target dots;
  - the wavelength label gets an orange "· loading…".
- Tested in the browser (map downloads slowed down so the state could be
  seen): shows on every wavelength and Colour change, clears once the map is
  drawn, works at phone width, no console errors.

## 15 Nov 2026: F13 flags overlay + lens fixes (`raman-f13-flags`)

- **`src/components/FlagsOverlay.js`** (+ `styles/FlagsOverlay.css`): a flag
  button in the big picture's top-left corner lays each frame's
  `flags_png_url` on top of it: red = pixels SPHEREx marked as unreliable
  (glare, ghosts, saturation, dead/hot pixels; the list is `OVERLAY` in
  `backend/pipeline/flags.py`). Pixel-sharp, follows the blink loop.
  - A legend says "Flagged pixels", or "Nothing flagged in this picture" for a
    frame without a flags PNG.
  - Greyed out when no frame has flags (false colour has none).
  - In false colour it's greyed out and says flags are per array: the colour
    pictures have no flags layer, on purpose.
- **GIF export** (`GifExport.js`): new "Flagged pixels" option under "On top",
  drawn on the Picture and Loupe panels. It starts the way the player's flag
  button is set, and isn't remembered like the other options.
- **`App.js`**: `flags=1` in the address bar and the share link; toggling it
  doesn't reload the frames.
- **`src/data/target.js`**: the Epsilon Indi B preset turns the overlay on
  (`showFlags: true`) and its "Look for" text explains the red pixels.
- **Lens** (`Loupe.js`, `Loupe.css`): with a small lens and a big zoom (e.g.
  2′, 10×, 80 px) the orange outline of one pixel was wider than the lens and
  stuck out of the circle. The lens now clips to its circle, and the outline
  is hidden once one pixel fills more than half the lens. The zoom badge moved
  below the flag button.
- Tested in the browser:
  - Epsilon Indi B at 20′: the saturated core of Epsilon Indi A shows red.
  - The toggle adds and removes `flags=1` in the address bar and the share link.
  - Another preset leaves the overlay alone; the Epsilon Indi B preset turns it on.
  - In false colour the button is greyed out.
  - All 5 presets, every frame: the flags image loads, or the legend says
    nothing is flagged (matches the baked `frames.json`).
  - GIF of Barnard's Star: 721 red pixels in the first frame with flags on, 0 with them off.
  - At 2′, 10×, 80 px the lens shows no outline and nothing outside the circle.
  - No console errors.

## 14 Nov 2026: Easter egg: SPACE JUNK SWEEPER (`frontendApiConnection`)

- Type **↑ ↑ ↓ ↓ ← → ← → B A Enter** anywhere on the site (not in a text
  field) to open an original arcade shooter: fly a survey satellite and clear
  drifting space junk so SPHEREx can see the stars. Big junk breaks into
  smaller pieces, waves get bigger, best score is remembered.
- Controls: ← → turn · ↑ thrust · Space fire · P pause · M sound · Esc leave.
- Sound effects are synthesised with the Web Audio API (no audio files):
  laser, crunches, engine rumble, boom, chimes. M mutes and is remembered.
- No libraries or downloads; works on the public site without a backend.
- Files: `src/components/EasterEgg.js` (key listener), `SpaceJunkSweeper.js`
  (game), `src/styles/EasterEgg.css`.
- Tested in the browser:
  - The code opens it.
  - Firing, scoring and lives work.
  - Sounds play and M mutes them.
  - Esc closes it and releases the audio.
  - The page's keyboard shortcuts don't fire while playing.

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

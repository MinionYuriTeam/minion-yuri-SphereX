# backend

Python does all the astronomy; the frontend only gets JSON and PNGs.
For the whole project (and how to connect the frontend), see the
[root README](../README.md).

```
backend/
├── api.py              HTTP API for the frontend (FastAPI)
├── epochs.py           command-line tool: PNG grid / GIF / FITS for a position
├── pipeline/           the data pipeline, one file per step
│   ├── search.py       1. find every exposure covering the position (IRSA)
│   ├── fetch.py        2. download just the small square we need (AWS)
│   ├── grid.py         3. resample every square onto one north-up grid
│   ├── stacks.py       4. group exposures into epochs and stack → get_stacks()
│   ├── render.py       PNGs for the browser
│   ├── resolve.py      names / coordinates → RA, Dec (+ proper motion)
│   ├── flags.py        what each FLAGS bit means
│   └── settings.py     shared constants
├── requirements.txt
└── output/             downloads and generated images (not in git)
```

## Setup

```bash
cd backend
python3 -m venv .venv                      # skip if .venv already exists
.venv/bin/pip install -r requirements.txt
```

## Run the API

```bash
.venv/bin/uvicorn api:app --reload --port 8000
```

Then open http://localhost:8000/docs to try every endpoint in the browser.
The frontend's `src/api/frames.js` already points at `http://localhost:8000`;
set `USE_MOCK = false` there to use it.

### `GET /api/resolve?name=…` (F1)

Takes a name, decimal degrees or sexagesimal:

| `name=` | Result |
|---|---|
| `Barnard's Star`, `R Dra`, `eps Ind B` | Looked up with CDS Sesame (SIMBAD/NED/VizieR) |
| `269.452075 4.693391` or `269.45, 4.69` | Used as is |
| `08h55m10.831s -07d14m42.53s` or `08:55:10.83 -07:14:42.5` | Used as is |

```json
{
  "query": "Barnard's Star", "name": "Barnard's star",
  "ra": 269.452077, "dec": 4.693365,
  "pm_ra_mas_yr": -801.551, "pm_dec_mas_yr": 10362.394,
  "ra_now": 269.446074, "dec_now": 4.770708,
  "source": "sesame/S=Simbad, …"
}
```

`ra`/`dec` are catalogue (year 2000) positions. **`ra_now`/`dec_now` are the
position moved forward to today with the proper motion.** Use those to centre
the view on fast stars: Barnard's Star has moved ~4.5′ since 2000 and
WISE 0855 ~1.4′, so a 5′ field centred on the 2000 position misses them.

Errors: `400` for out-of-range coordinates, `404` for an unknown name, `503`
if the lookup service is down. Sesame doesn't know `WISE 0855-0714`; use
`WISE J085510.83-071442.5` or the coordinates.

### `GET /api/frames?ra=&dec=&fov=&array=` (F3, F5)

| Parameter | Default | Meaning |
|---|---|---|
| `ra`, `dec` | required | Centre, decimal degrees |
| `fov` | `5` | Width in arcminutes (max 60). Pixels across ≈ fov × 9.76 |
| `array` | `3` | Detector array 1–6, short → long wavelength |
| `per_exposure` | `false` | `true` = one frame per exposure instead of per epoch |

```json
{
  "array": 1,
  "wavelength_um": [0.746, 1.117],
  "epochs": [
    { "date": "2025-08-30", "n_exposures": 18,
      "png_url": "http://localhost:8000/files/…/epoch_00.png?v=…",
      "flags_png_url": "http://localhost:8000/files/…/epoch_00_flags.png?v=…",
      "datetime": "2025-08-30T14:51:21.129",
      "date_start": "2025-08-28T10:21:47.532", "date_end": "2025-09-05T02:35:19.911" }
  ],
  "ra": 269.452075, "dec": 4.693391, "fov": 12,
  "size_px": 117, "pixel_scale_arcsec": 6.15,
  "display_range": [-0.05, 8.1],
  "n_skipped": 3, "n_failed": 0, "elapsed_s": 4.6
}
```

- The first four fields are exactly the agreed contract; the rest are extras.
- **`png_url`**: grey-scale, north up, east left, `size_px` square, centred on
  `ra`/`dec`. All epochs share one brightness scale, so only real changes
  blink. PNGs are native SPHEREx pixels; scale them up in the browser with
  `image-rendering: pixelated`.
- **`flags_png_url`**: transparent PNG with artifact pixels (saturation,
  ghosts, halos, dead pixels…) in red, to lay on top. `null` if there are none.
- **For overlays (Gaia marker)**: a point at (RA, Dec) is at pixel
  `x = c − ΔRA·cos(dec)·3600/pixel_scale_arcsec`, `y = c − ΔDec·3600/pixel_scale_arcsec`
  from the PNG's top-left, where `c = (size_px − 1)/2` (east is left, north is up).
- `n_skipped`: exposures left out because the position was too close to a
  detector edge to fill the square. Bigger `fov` → more skipped.
- Error `503` if IRSA's search is down and the position was never searched.

**Speed:** the first request for a position and array downloads ~0.3 MB per
exposure from AWS, about 30–60 s. After that it takes a few seconds. The list
of exposures is reused for 6 hours, so IRSA's search isn't hit on every call.

**When IRSA is flaky:** on bad days IRSA answers about 2 of 3 requests with
`502 Proxy Error`. The search retries up to 12 times, a second or two apart.
If it still fails, it uses the last saved list for that position, or returns
`503` if there is none. Image downloads come from AWS and aren't affected.
Pre-cache the demo targets by calling `/api/frames` for each one beforehand.

## Use the pipeline from Python (Axe)

```python
from pipeline import get_stacks, resolve, OVERLAY

s = get_stacks(ra=269.452075, dec=4.693391, fov=5, array=3)
s.wavelength_um, s.display_range, s.n_skipped
for e in s.epochs:            # oldest first
    e.date, e.n_exposures     # ISO date-time, int
    e.image                   # float32 (n, n), MJy/sr, background removed, row 0 = SOUTH
    e.flags & OVERLAY         # artifact pixels (see pipeline/flags.py)
    e.wcs                     # astropy WCS of the square
```

`pipeline/render.py` has the PNG code the API uses (`save_epoch_pngs`).

## Command-line tool

`epochs.py` makes pictures of one position without running the API. Run it
from the **`backend/`** folder: `.venv` and `epochs.py` live there, so from the
project root you get `no such file or directory: .venv/bin/python`.

```bash
cd backend
.venv/bin/python epochs.py [ra] [dec] [--fov FOV] [--arrays N [N ...]] [--per-exposure]
```

### All arguments

| Argument | Default | What it does |
|---|---|---|
| `ra` | asks you | Right Ascension in decimal degrees (0–360) |
| `dec` | asks you | Declination in decimal degrees (−90 to 90) |
| `--fov FOV` | `3` | Width of the square in **arcminutes**. Pixels across ≈ FOV × 9.76: `3` → 29 px, `5` → 49 px, `10` → 99 px, `31` → 303 px |
| `--arrays N [N ...]` | `1 2 3 4 5 6` | Which detector arrays to make, 1 (short wavelength) to 6 (long). Several are separated by spaces: `--arrays 1 6` |
| `--per-exposure` | off | One frame per **exposure** (~60 per array) instead of one per **visit** (~4–7 per array, exposures stacked) |
| `-h`, `--help` | | Show this list in the terminal |

Leave out `ra` and `dec` and it asks for them, like `main.py` does.

### Examples

```bash
# ask for RA / Dec, all 6 arrays, 3′ square, one frame per visit
.venv/bin/python epochs.py

# Barnard's Star at its year-2000 position (the star itself is ~4.5′ north)
.venv/bin/python epochs.py 269.452075 4.693391

# Barnard's Star where it is today, 5′ square, only arrays 1 and 6
.venv/bin/python epochs.py 269.446074 4.770708 --fov 5 --arrays 1 6

# every single exposure instead of one frame per visit
.venv/bin/python epochs.py 269.452075 4.693391 --per-exposure

# a bigger square (~300 px); exposures that can't fill it are skipped
.venv/bin/python epochs.py 269.446074 4.770708 --fov 31 --arrays 3

# everything at once
.venv/bin/python epochs.py 133.757786 -7.242023 --fov 10 --arrays 5 6 --per-exposure
```

### Visit vs exposure

SPHEREx takes many exposures of a patch over a few days (a **visit**), then
comes back about six months later. By default, exposures less than 7 days
apart are stacked into one frame per visit. That removes cosmic rays and
noise, so stars keep the same brightness and only real changes blink. The
number in brackets on each frame of the PNG is how many exposures went in:
`2025-08-21 (17)`. With `--per-exposure` every exposure is its own frame, which
gives many more frames but more flicker.

### Output

Written to `output/<ra>_<dec>/` (e.g. `output/269.452075_4.693391/`), per array:

| File | Contents |
|---|---|
| `D<n>_frames.png` | Every frame side by side, with dates |
| `D<n>_frames.gif` | The frames as a blinking animation, oldest first |
| `D<n>_frames.fits` | The frames as a data cube (MJy/sr) plus a `DATES` table, for astronomy tools |

Running again with a different `--fov` or `--per-exposure` overwrites these
three files. Downloads are cached in `output/<ra>_<dec>/cutouts/<fov>arcmin/`,
so a second run with the same `--fov` takes seconds.

The terminal prints, per array, the wavelength range, the number of frames and
their size, how many exposures were skipped or failed, and each frame's date
and exposure count.

## How it works, in plain words

1. **Search.** IRSA's image search (SIA2) lists every SPHEREx exposure that
   contains the position, from `spherex_dr1` and `spherex_qr3` (QR2 is no
   longer served). Each exposure is on one of 6 detector arrays.
2. **Download a small square.** IRSA keeps every file on AWS. Instead of the
   65 MB file we fetch only the detector rows around the position, for the
   IMAGE and FLAGS layers, with HTTP range requests. Squares are cached in
   `output/<ra>_<dec>/cutouts/`.
3. **Align.** Every exposure is rotated differently, so each square is
   resampled onto one grid: north up, centred on the position, 6.15″ pixels.
4. **Stack per epoch (F5).** SPHEREx revisits a patch for a few days about
   every 6 months. Exposures within 7 days form one epoch. Each exposure's
   background is subtracted, then the epoch is the median of its exposures,
   skipping bad pixels (cosmic rays, hot/dead pixels). Measured on Barnard's
   Star, field stars vary only ~3–4% between epochs, versus 15–22% between
   single exposures.

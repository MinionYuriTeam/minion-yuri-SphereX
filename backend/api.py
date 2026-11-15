"""
HTTP API for the frontend. Start it with:

    .venv/bin/uvicorn api:app --reload --port 8000

then open http://localhost:8000/docs to try every endpoint in the browser.

    GET /api/resolve?name=barnards+star
        -> { ra, dec, pm_ra_mas_yr, pm_dec_mas_yr, ra_now, dec_now, name, source }
    GET /api/frames?ra=269.45&dec=4.69&fov=5&array=3
        -> { array, wavelength_um: [lo, hi],
             epochs: [ { date, n_exposures, png_url, flags_png_url, ... } ], ... }
    GET /api/health
        -> { ok: true }

PNGs are served from /files/... . Their URLs are absolute, built from the
address the request came in on; set PUBLIC_BASE_URL when running behind a
proxy or on a host (e.g. https://our-backend.onrender.com).
"""

import os
import time

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from pipeline import (BadInput, NotFound, ResolverUnavailable, SearchUnavailable,
                      get_stacks, resolve)
from pipeline.render import save_epoch_pngs
from pipeline.settings import OUTPUT_ROOT, position_dir
from pipeline.spectrum import bin_spectrum, get_spectrum

app = FastAPI(title="Minion Yuri SPHEREx API")
# Any site may call this API, including the public frontend (stealingthemoon.earth)
# calling a backend on the visitor's own machine (http://localhost:8000).
# allow_private_network answers Chrome's "may a public site talk to localhost?"
# check (Private / Local Network Access); Chrome may also ask the visitor.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"],
                   allow_headers=["*"], allow_private_network=True)
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=OUTPUT_ROOT), name="files")


@app.get("/", include_in_schema=False)
def home():
    """The Hugging Face Space page opens '/': show the interactive API docs."""
    return RedirectResponse("/docs")


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/resolve")
def api_resolve(name: str = Query(..., description="Object name or RA/Dec")):
    """Name ('Barnard's Star'), decimal ('269.45 4.69') or sexagesimal
    ('08h55m10.8s -07d14m42s') -> position (+ proper motion for names)."""
    try:
        return resolve(name)
    except BadInput as exc:
        raise HTTPException(400, str(exc))
    except NotFound as exc:
        raise HTTPException(404, str(exc))
    except ResolverUnavailable as exc:
        raise HTTPException(503, str(exc))


@app.get("/api/frames")
def api_frames(
    request: Request,
    ra: float = Query(..., ge=0, lt=360, description="Right Ascension, degrees"),
    dec: float = Query(..., ge=-90, le=90, description="Declination, degrees"),
    fov: float = Query(5, gt=0, le=60, description="Field of view, arcminutes"),
    array: int = Query(3, ge=1, le=6, description="Detector array, 1 (short) - 6 (long)"),
    per_exposure: bool = Query(False, description="One frame per exposure, not per epoch"),
):
    """Aligned, stacked frames of one patch of sky on one detector array."""
    t0 = time.time()
    try:
        s = get_stacks(ra, dec, fov, array, per_exposure=per_exposure)
    except SearchUnavailable as exc:
        raise HTTPException(503, str(exc))

    folder = (position_dir(ra, dec) / "png"
              / f"D{array}_fov{fov:g}{'_exposures' if per_exposure else ''}")
    paths = save_epoch_pngs(s, folder)
    base = os.environ.get("PUBLIC_BASE_URL", str(request.base_url)).rstrip("/")
    stamp = int(time.time())  # so browsers don't show an older PNG at the same URL

    def url(path):
        if path is None:
            return None
        return f"{base}/files/{path.relative_to(OUTPUT_ROOT).as_posix()}?v={stamp}"

    size = s.epochs[0].image.shape[0] if s.epochs else 0
    return {
        "array": array,
        "wavelength_um": list(s.wavelength_um),
        "epochs": [
            {
                "date": e.date[:10],
                "datetime": e.date,
                "date_start": e.date_start,
                "date_end": e.date_end,
                "n_exposures": e.n_exposures,
                "png_url": url(img),
                "flags_png_url": url(flg),
            }
            for e, (img, flg) in zip(s.epochs, paths)
        ],
        # extras for overlays (Gaia marker, loupe): the image is a north-up
        # square centred on (ra, dec), `size` pixels of `pixel_scale_arcsec`
        "ra": ra,
        "dec": dec,
        "fov": fov,
        "size_px": size,
        "pixel_scale_arcsec": s.pixel_scale_arcsec,
        "display_range": list(s.display_range),
        "n_skipped": s.n_skipped,
        "n_failed": s.n_failed,
        "elapsed_s": round(time.time() - t0, 1),
    }



@app.get("/api/spectrum")
def api_spectrum(
    ra: float = Query(..., ge=0, lt=360), dec: float = Query(..., ge=-90, le=90),
    binned: bool = Query(False, description="Median per visit and wavelength bin"),
    pm_ra: float = Query(0.0, description="Proper motion in RA, mas/yr (from /api/resolve)"),
    pm_dec: float = Query(0.0, description="Proper motion in Dec, mas/yr"),
):
    try:
        s = get_spectrum(ra, dec, pm_ra, pm_dec)
    except SearchUnavailable as exc:
        raise HTTPException(503, str(exc))
    if binned:
        s["points"] = bin_spectrum(s["points"])
    return s

from pipeline.rgb import save_rgb_pngs

@app.get("/api/rgb")
def api_rgb(
    request: Request,
    ra: float = Query(..., ge=0, lt=360), dec: float = Query(..., ge=-90, le=90),
    fov: float = Query(5, gt=0, le=60),
    arrays: str = Query("6,4,2", pattern=r"^[1-6],[1-6],[1-6]$",
                        description="Detector arrays for red, green, blue"),
):
    picked = tuple(int(a) for a in arrays.split(","))
    folder = position_dir(ra, dec) / "png" / f"rgb{''.join(map(str, picked))}_fov{fov:g}"
    try:
        frames = save_rgb_pngs(ra, dec, fov, folder, picked)
    except SearchUnavailable as exc:
        raise HTTPException(503, str(exc))
    base = os.environ.get("PUBLIC_BASE_URL", str(request.base_url)).rstrip("/")
    stamp = int(time.time())
    return {"arrays": list(picked), "ra": ra, "dec": dec, "fov": fov,
            "epochs": [{"date": date,
                        "png_url": f"{base}/files/{path.relative_to(OUTPUT_ROOT).as_posix()}?v={stamp}"}
                       for date, path in frames]}
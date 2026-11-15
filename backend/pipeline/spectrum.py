# Spectrum of one sky position: one point per exposure, all six arrays.

from concurrent.futures import ThreadPoolExecutor

import numpy as np
import math
from astropy.time import Time
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.wcs import WCS

from .fetch import is_cached, load_cutout
from .progress import Progress
from .flags import BAD_FOR_STACKING, FLAG_BITS
from .search import find_exposures
from .settings import PIXEL_SCALE_ARCSEC, position_dir
from .wavelength import wavelength_at

MJY_PER_SR_TO_MJY = (PIXEL_SCALE_ARCSEC / 206264.806) ** 2 * 1e9   # one pixel: 0.889

OVERFLOW, TRANSIENT = FLAG_BITS["OVERFLOW"], FLAG_BITS["TRANSIENT"]
UNUSABLE = BAD_FOR_STACKING & ~(OVERFLOW | TRANSIENT)   # SUR_ERROR, dead, hot, cold, missing...

def moved_position(ra, dec, pm_ra, pm_dec, years):
    """(ra, dec) shifted by `years` of proper motion (mas/yr; pm_ra includes cos(dec))."""
    dec_then = dec + pm_dec * years / 3.6e6
    ra_then = ra + pm_ra * years / 3.6e6 / math.cos(math.radians(dec))
    return ra_then % 360, dec_then


def recentre(image, x, y, search_px=3, min_sigma=10.0):
    """Move (x, y) onto the star, if one is clearly visible within search_px pixels."""
    h, w = image.shape
    xi, yi = int(round(x)), int(round(y))
    if not (search_px + 2 <= xi < w - search_px - 2 and search_px + 2 <= yi < h - search_px - 2):
        return x, y
    finite = image[np.isfinite(image)]
    sky = np.median(finite)
    noise = 1.4826 * np.median(np.abs(finite - sky)) or 1.0
    box = np.nan_to_num(image[yi - search_px:yi + search_px + 1,
                              xi - search_px:xi + search_px + 1], nan=sky)
    py, px = np.unravel_index(np.argmax(box), box.shape)
    if box[py, px] - sky < min_sigma * noise:
        return x, y                                   # nothing obvious here: stay put
    py, px = py + yi - search_px, px + xi - search_px
    core = np.clip(np.nan_to_num(image[py - 2:py + 3, px - 2:px + 3], nan=sky) - sky, 0, None)
    yy, xx = np.mgrid[-2:3, -2:3]
    return float(px + (core * xx).sum() / core.sum()), float(py + (core * yy).sum() / core.sum())

def aperture_flux(image, flags, x, y, r=2.0, r_in=4.0, r_out=7.0):
    """Light inside a small circle minus the sky around it.
    Returns (flux_mjy, error_mjy, quality) or None. quality is "good", or "bright"
    when the core passed the overflow threshold (flux is approximate)."""
    h, w = image.shape
    if not (r_out <= x < w - r_out and r_out <= y < h - r_out):
        return None                                   # too close to the cutout edge
    yy, xx = np.indices(image.shape)
    dist = np.hypot(xx - x, yy - y)
    ap, ring = dist <= r, (dist >= r_in) & (dist <= r_out)
    bits = int(np.bitwise_or.reduce(flags[ap]))
    if not np.isfinite(image[ap]).all() or bits & UNUSABLE:
        return None                                   # no usable measurement of the core
    if bits & TRANSIENT and not bits & OVERFLOW:
        return None                                   # a cosmic ray, not a bright star
    sky_ok = ring & np.isfinite(image) & ((flags & BAD_FOR_STACKING) == 0)
    if sky_ok.sum() < 20:
        return None
    sky = np.median(image[sky_ok])
    noise = 1.4826 * np.median(np.abs(image[sky_ok] - sky))
    return (float((image[ap] - sky).sum() * MJY_PER_SR_TO_MJY),
            float(noise * np.sqrt(ap.sum()) * MJY_PER_SR_TO_MJY),
            "bright" if bits & OVERFLOW else "good")

def number_visits(points, gap_days=7.0):
    """Add 'visit' (0, 1, 2...) to every point: same rule as the frames."""
    visit, last = -1, None
    for p in sorted(points, key=lambda p: p["mjd"]):
        if last is None or p["mjd"] - last > gap_days:
            visit += 1
        p["visit"], last = visit, p["mjd"]
    return points


def bin_spectrum(points, bins_per_array=17):
    """Median flux per (visit, array, wavelength bin): steadier points for faint targets."""
    groups = {}
    for p in points:
        edges = np.geomspace(*p["array_range_um"], bins_per_array + 1)
        b = int(np.clip(np.searchsorted(edges, p["wavelength_um"]) - 1, 0, bins_per_array - 1))
        groups.setdefault((p["visit"], p["array"], b), []).append(p)
    return [{"visit": visit, "array": array, "n": len(g), "date": g[0]["date"],
             "wavelength_um": round(float(np.median([p["wavelength_um"] for p in g])), 4),
             "flux_mjy": float(np.median([p["flux_mjy"] for p in g])),
             "error_mjy": float(np.sqrt(sum(p["error_mjy"] ** 2 for p in g)) / len(g)),
             "quality": "bright" if any(p["quality"] == "bright" for p in g) else "good",}
            for (visit, array, b), g in sorted(groups.items())]


def get_spectrum(ra, dec, pm_ra=0.0, pm_dec=0.0, fov=3.0, workers=8):
    coord = SkyCoord(ra * u.deg, dec * u.deg)
    folder = position_dir(ra, dec)
    cache = folder / "cutouts" / f"{float(fov)}arcmin"
    cache.mkdir(parents=True, exist_ok=True)
    exposures = find_exposures(coord, folder)
    today = Time.now().mjd
    progress = Progress("spectrum (all arrays)", coord, fov, len(exposures),
                        sum(not is_cached(e, fov, cache) for e in exposures), workers)

    def measure(e):                      # in threads: download and photometry only
        try:
            cut = load_cutout(e, coord, fov, cache, progress)
        except Exception as exc:
            progress.fail(e, exc)
            return None
        try:
            then = moved_position(ra, dec, pm_ra, pm_dec, (e["mjd"] - today) / 365.25)
            x, y = (float(v) for v in WCS(cut.header).all_world2pix(*then, 0))
            x, y = recentre(cut.image, x, y)
            flux = aperture_flux(cut.image, cut.flags, x, y)

            return flux and (e, flux, cut.header["X0"] + x, cut.header["Y0"] + y)
        except Exception as exc:
            progress.say(f"   spectrum: skipped {e['obs_id']} D{e['array']}: {exc}")
            return None

    with ThreadPoolExecutor(workers) as pool:
        measured = [m for m in pool.map(measure, exposures) if m]
    progress.finish()

    points = []
    for e, (flux, error, quality), x, y in measured:   # wavelength lookup in ONE thread
        lam, width = wavelength_at(e, x, y)
        points.append({"wavelength_um": round(lam, 4), "bandwidth_um": round(width, 4),
                       "flux_mjy": flux, "error_mjy": error, "array": e["array"],
                       "array_range_um": [e["wavelength_min_um"], e["wavelength_max_um"]],
                       "date": e["date"][:10], "mjd": e["mjd"], "quality": quality})
    number_visits(points)
    return {"ra": ra, "dec": dec,
            "points": sorted(points, key=lambda p: p["wavelength_um"]),
            "n_exposures": len(exposures), "n_dropped": len(exposures) - len(points)}
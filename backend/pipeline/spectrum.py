# Spectrum of one sky position: one point per exposure, all six arrays.

from concurrent.futures import ThreadPoolExecutor

import numpy as np
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.wcs import WCS

from .fetch import load_cutout
from .flags import BAD_FOR_STACKING
from .search import find_exposures
from .settings import PIXEL_SCALE_ARCSEC, position_dir
from .wavelength import wavelength_at

MJY_PER_SR_TO_MJY = (PIXEL_SCALE_ARCSEC / 206264.806) ** 2 * 1e9   # one pixel: 0.889


def aperture_flux(image, flags, x, y, r=2.0, r_in=4.0, r_out=7.0):
    """Light inside a small circle minus the sky around it -> (flux, error) in mJy."""
    h, w = image.shape
    if not (r_out <= x < w - r_out and r_out <= y < h - r_out):
        return None                                   # too close to the cutout edge
    yy, xx = np.indices(image.shape)
    dist = np.hypot(xx - x, yy - y)
    ap, ring = dist <= r, (dist >= r_in) & (dist <= r_out)
    ok = np.isfinite(image) & ((flags & BAD_FOR_STACKING) == 0)
    if (ap & ~ok).any() or (ring & ok).sum() < 20:
        return None                                   # bad pixel on the star: skip
    sky = np.median(image[ring & ok])
    noise = 1.4826 * np.median(np.abs(image[ring & ok] - sky))
    return (float((image[ap] - sky).sum() * MJY_PER_SR_TO_MJY),
            float(noise * np.sqrt(ap.sum()) * MJY_PER_SR_TO_MJY))


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
             "error_mjy": float(np.sqrt(sum(p["error_mjy"] ** 2 for p in g)) / len(g))}
            for (visit, array, b), g in sorted(groups.items())]


def get_spectrum(ra, dec, fov=3.0, workers=8):
    coord = SkyCoord(ra * u.deg, dec * u.deg)
    folder = position_dir(ra, dec)
    cache = folder / "cutouts" / f"{float(fov)}arcmin"
    cache.mkdir(parents=True, exist_ok=True)
    exposures = find_exposures(coord, folder)

    def measure(e):                      # in threads: download and photometry only
        try:
            cut = load_cutout(e, coord, fov, cache)
            x, y = (float(v) for v in WCS(cut.header).all_world2pix(ra, dec, 0))
            flux = aperture_flux(cut.image, cut.flags, x, y)
            return flux and (e, flux, cut.header["X0"] + x, cut.header["Y0"] + y)
        except Exception as exc:
            print(f"   spectrum: skipped {e['obs_id']} D{e['array']}: {exc}")
            return None

    with ThreadPoolExecutor(workers) as pool:
        measured = [m for m in pool.map(measure, exposures) if m]

    points = []
    for e, (flux, error), x, y in measured:   # wavelength lookup in ONE thread
        lam, width = wavelength_at(e, x, y)
        points.append({"wavelength_um": round(lam, 4), "bandwidth_um": round(width, 4),
                       "flux_mjy": flux, "error_mjy": error, "array": e["array"],
                       "array_range_um": [e["wavelength_min_um"], e["wavelength_max_um"]],
                       "date": e["date"][:10], "mjd": e["mjd"]})
    number_visits(points)
    return {"ra": ra, "dec": dec,
            "points": sorted(points, key=lambda p: p["wavelength_um"]),
            "n_exposures": len(exposures), "n_dropped": len(exposures) - len(points)}
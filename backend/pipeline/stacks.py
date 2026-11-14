"""
Step 4: group exposures into epochs and stack them (F5). This is get_stacks().

SPHEREx visits each patch of sky for a few days roughly every six months, and
takes many exposures per visit. One visit = one *epoch*. Exposures closer
together than `epoch_gap_days` belong to the same epoch.

Per epoch we take the median of its exposures (after aligning them and
removing each one's background), skipping bad pixels such as cosmic rays.
Because every epoch is in the same physical units (MJy/sr) and we hand back
ONE display range for all epochs of an array, a star that doesn't change
keeps the same brightness from frame to frame. Only real changes blink.

Always compare epochs within one array: each array covers a different
wavelength range, and stars look very different across them.
"""

import warnings
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.time import Time
from astropy.wcs import WCS

from .fetch import load_cutout
from .flags import BAD_FOR_STACKING, FLAG_BITS
from .grid import fills, make_grid, resample, resample_flags
from .search import find_exposures
from .settings import COLLECTIONS, position_dir


@dataclass
class Epoch:
    date: str              # ISO date-time, average of the epoch's exposures
    date_start: str        # first exposure
    date_end: str          # last exposure
    mjd: float
    n_exposures: int
    image: np.ndarray      # float32 (n, n), MJy/sr, background removed; row 0 = south
    flags: np.ndarray      # int32 (n, n): bits set in at least half the exposures
    wcs: WCS               # the shared grid (same for every epoch)
    obs_ids: list = field(default_factory=list)


@dataclass
class Stacks:
    ra: float
    dec: float
    fov_arcmin: float
    array: int                 # 1-6, short to long wavelength
    wavelength_um: tuple       # (lo, hi) range of this array
    epochs: list               # list[Epoch], oldest first
    display_range: tuple       # (vmin, vmax) to use for EVERY epoch
    pixel_scale_arcsec: float
    n_skipped: int = 0         # exposures whose square was cut off by a detector edge
    n_failed: int = 0          # exposures that failed to download


def get_stacks(ra, dec, fov=5.0, array=1, per_exposure=False, epoch_gap_days=7.0,
               collections=COLLECTIONS, workers=8):
    """Aligned, stacked SPHEREx images of one patch of sky, one per epoch.

    ra, dec        centre of the square, decimal degrees
    fov            width of the square in arcminutes (pixels ~= fov * 9.76)
    array          detector array 1-6
    per_exposure   True: every exposure is its own frame (no stacking)
    epoch_gap_days exposures closer together than this form one epoch
    """
    if array not in range(1, 7):
        raise ValueError("array must be between 1 and 6")
    coord = SkyCoord(ra * u.deg, dec * u.deg)
    folder = position_dir(ra, dec)
    cache = folder / "cutouts" / f"{float(fov)}arcmin"
    cache.mkdir(parents=True, exist_ok=True)

    # 1. which exposures cover this spot on this array
    exposures = [e for e in find_exposures(coord, folder, collections)
                 if e["array"] == array]
    grid = make_grid(coord, fov)

    # 2-3. download each one's square and put it on the shared grid
    def prepare(exposure):
        try:
            cutout = load_cutout(exposure, coord, fov, cache)
        except Exception as exc:
            print(f"   download failed: {exposure['obs_id']} D{array}: {exc}")
            return "failed"
        if not fills(grid, cutout):
            return "skipped"
        return _aligned_frame(exposure, cutout, grid)

    with ThreadPoolExecutor(workers) as pool:
        results = list(pool.map(prepare, exposures))
    frames = sorted((r for r in results if isinstance(r, dict)), key=lambda f: f["mjd"])

    # 4. group into epochs and stack
    groups = [[f] for f in frames] if per_exposure else _group_by_visit(frames, epoch_gap_days)
    epochs = [_stack(group, grid) for group in groups]

    return Stacks(
        ra=ra, dec=dec, fov_arcmin=fov, array=array,
        wavelength_um=((min(e["wavelength_min_um"] for e in exposures),
                        max(e["wavelength_max_um"] for e in exposures))
                       if exposures else (None, None)),
        epochs=epochs,
        display_range=_display_range(epochs),
        pixel_scale_arcsec=abs(grid.wcs.wcs.cdelt[0]) * 3600,
        n_skipped=results.count("skipped"),
        n_failed=results.count("failed"),
    )


def _aligned_frame(exposure, cutout, grid):
    image = resample(grid, cutout)
    flags = resample_flags(grid, cutout)
    # remove the background (zodiacal light changes with season), measured
    # on good pixels only
    good = np.isfinite(image) & ((flags & BAD_FOR_STACKING) == 0)
    image -= np.median(image[good]) if good.any() else np.nanmedian(image)
    return {"image": image, "flags": flags, "obs_id": exposure["obs_id"],
            "mjd": float(cutout.header.get("MJD-AVG", exposure["mjd"]))}


def _group_by_visit(frames, gap_days):
    groups = []
    for frame in frames:  # frames are sorted by date
        if groups and frame["mjd"] - groups[-1][-1]["mjd"] <= gap_days:
            groups[-1].append(frame)
        else:
            groups.append([frame])
    return groups


def _stack(group, grid):
    images = np.stack([f["image"] for f in group])
    flags = np.stack([f["flags"] for f in group])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN columns
        image = np.nanmedian(np.where(flags & BAD_FOR_STACKING, np.nan, images), axis=0)
        # where every exposure is flagged (e.g. a saturated star), use all of them
        holes = ~np.isfinite(image)
        image[holes] = np.nanmedian(images, axis=0)[holes]
    mjds = np.array([f["mjd"] for f in group])
    return Epoch(
        date=Time(mjds.mean(), format="mjd").isot,
        date_start=Time(mjds.min(), format="mjd").isot,
        date_end=Time(mjds.max(), format="mjd").isot,
        mjd=float(mjds.mean()),
        n_exposures=len(group),
        image=image.astype(np.float32),
        flags=_majority_flags(flags),
        wcs=grid.wcs.deepcopy(),
        obs_ids=[f["obs_id"] for f in group],
    )


def _majority_flags(flags):
    """Keep a bit where at least half the exposures have it: lasting problems
    (saturation, halos, dead pixels) stay, one-off cosmic rays drop out."""
    n = len(flags)
    out = np.zeros(flags.shape[1:], dtype=np.int32)
    for bit in FLAG_BITS.values():
        out |= np.where(2 * ((flags & bit) != 0).sum(axis=0) >= n, bit, 0).astype(np.int32)
    return out


def _display_range(epochs):
    """One brightness range for all epochs, so steady stars look steady."""
    if not epochs:
        return (0.0, 1.0)
    pixels = np.concatenate([e.image[np.isfinite(e.image)] for e in epochs])
    lo, hi = np.percentile(pixels, [5, 99.5])
    return (float(lo), float(hi))

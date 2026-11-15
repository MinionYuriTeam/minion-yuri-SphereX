"""
Step 3: put every cutout on the same north-up grid.

Each exposure sees the sky at a different angle and position on the detector.
To compare them we resample every cutout onto one shared grid: a square
centred on the target, north up, east left, with SPHEREx's own 6.15" pixels.

For every pixel of the shared grid we ask "where is this point of the sky in
the cutout?" (using the WCS in each header) and read the cutout there:
bilinear interpolation for the image, nearest pixel for the flags (bits
can't be averaged).

Row 0 of the grid is the SOUTH edge (the FITS convention); flip it
vertically before saving a picture.
"""

from dataclasses import dataclass

import numpy as np
from astropy.wcs import WCS

from .settings import PIXEL_SCALE_ARCSEC


@dataclass
class Grid:
    wcs: WCS            # sky <-> pixel for the shared grid
    shape: tuple        # (height, width), always square and odd

    @property
    def size(self):
        return self.shape[0]


def make_grid(coord, fov_arcmin):
    """Square grid of fov_arcmin width centred on coord (odd size, so the
    target falls exactly on the centre pixel)."""
    scale_deg = PIXEL_SCALE_ARCSEC / 3600
    n = round(fov_arcmin / 60 / scale_deg)
    n += (n + 1) % 2
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = [coord.ra.deg, coord.dec.deg]
    wcs.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    wcs.wcs.cdelt = [-scale_deg, scale_deg]  # minus: east is on the left
    return Grid(wcs, (n, n))


def fills(grid, cutout, step=8):
    """True if the cutout covers the whole grid. Exposures where the target is
    too close to a detector edge leave empty corners and get skipped."""
    n = grid.size
    edge = np.unique(np.r_[np.arange(0, n, step), n - 1])
    zeros, last = np.zeros_like(edge), np.full_like(edge, n - 1)
    x = np.r_[edge, edge, zeros, last]   # walk along all four edges
    y = np.r_[zeros, last, edge, edge]
    xin, yin = _grid_to_cutout(grid, cutout.header, x, y)
    h, w = cutout.image.shape
    return bool(np.all((xin >= 0) & (xin < w - 1) & (yin >= 0) & (yin < h - 1)))


def resample(grid, cutout):
    """The cutout's image on the shared grid (bilinear), float32."""
    yy, xx = np.mgrid[0:grid.size, 0:grid.size]
    xin, yin = _grid_to_cutout(grid, cutout.header, xx, yy)
    return _bilinear(cutout.image, xin, yin).astype(np.float32)


def resample_flags(grid, cutout):
    """The cutout's flags on the shared grid (nearest pixel), int32."""
    yy, xx = np.mgrid[0:grid.size, 0:grid.size]
    xin, yin = _grid_to_cutout(grid, cutout.header, xx, yy)
    xi, yi = np.rint(xin).astype(int), np.rint(yin).astype(int)
    h, w = cutout.flags.shape
    inside = (xi >= 0) & (yi >= 0) & (xi < w) & (yi < h)
    out = np.zeros(grid.shape, dtype=np.int32)
    out[inside] = cutout.flags[yi[inside], xi[inside]]
    return out


def _grid_to_cutout(grid, header, x, y):
    """Grid pixel (x, y) -> cutout pixel, via the sky (incl. SIP distortion)."""
    ra, dec = grid.wcs.pixel_to_world_values(x, y)
    return WCS(header).all_world2pix(ra, dec, 0, quiet=True)


def _bilinear(img, x, y):
    h, w = img.shape
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    inside = (x0 >= 0) & (y0 >= 0) & (x0 < w - 1) & (y0 < h - 1)
    x0, y0 = np.clip(x0, 0, w - 2), np.clip(y0, 0, h - 2)
    out = (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
           + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)
    out[~inside] = np.nan
    return out

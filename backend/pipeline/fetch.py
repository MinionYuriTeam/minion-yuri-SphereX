"""
Step 2: download a small square of one exposure from AWS.

A SPHEREx file is ~65 MB: a 2040x2040 IMAGE layer, a FLAGS layer (bad-pixel
bits) and several more we don't need. IRSA keeps a public copy on AWS S3, and
S3 lets us ask for any byte range of a file. So for each exposure we:

  1. read the small headers at the start of the file,
  2. work out which detector rows contain our square (from the header's WCS),
  3. download just those rows of IMAGE, and the same rows of FLAGS.

That's ~0.3 MB per exposure instead of 65 MB. Results are cached on disk.

FITS files are made of 2880-byte blocks. Each layer ("HDU") is a header
block followed by its data. FLAGS is stored compressed, one detector row per
compressed tile, so we can fetch and decompress just the rows we need.
"""

import time
from dataclasses import dataclass

import numpy as np
import requests
from astropy.io import fits
from astropy.wcs import WCS

from .settings import PIXEL_SCALE_ARCSEC

BLOCK = 2880  # FITS block size in bytes
_http = requests.Session()


@dataclass
class Cutout:
    image: np.ndarray       # float32, surface brightness in MJy/sr
    flags: np.ndarray       # int32 bitmask per pixel (zeros if unavailable)
    header: fits.Header     # IMAGE header, WCS shifted to this cutout


def load_cutout(exposure, coord, fov_arcmin, cache_dir):
    """The square around `coord` from one exposure, from disk if we have it.

    cache_dir is .../cutouts/<fov>arcmin/. A square cached for a BIGGER field
    of view also covers this one, so it is reused instead of downloading again.
    """
    name = f"{exposure['obs_id']}_D{exposure['array']}.fits"
    path = cache_dir / name
    for candidate in [path] + _bigger_cached(cache_dir, name, fov_arcmin):
        if candidate.exists():
            with fits.open(candidate) as hdus:
                return Cutout(hdus[0].data, hdus["FLAGS"].data, hdus[0].header)

    # The output square is north-up but the detector is rotated, so download
    # a box sqrt(2) bigger (plus a small margin) to cover it at any angle.
    box_arcmin = fov_arcmin * 2 ** 0.5 + 4 * PIXEL_SCALE_ARCSEC / 60
    cutout = read_cutout(exposure["aws_url"], coord, box_arcmin)
    fits.HDUList([fits.PrimaryHDU(cutout.image, cutout.header),
                  fits.ImageHDU(cutout.flags, name="FLAGS")]).writeto(path, overwrite=True)
    return cutout


def _bigger_cached(cache_dir, name, fov_arcmin):
    """Cached files with the same name for bigger fields of view, smallest first."""
    found = []
    for folder in cache_dir.parent.glob("*arcmin"):
        try:
            fov = float(folder.name.removesuffix("arcmin"))
        except ValueError:
            continue
        if fov > fov_arcmin and (folder / name).exists():
            found.append((fov, folder / name))
    return [p for _, p in sorted(found)]


def read_cutout(url, coord, box_arcmin):
    """Download a box_arcmin square around coord from the file at url."""
    # 1. headers: the empty primary HDU, then the IMAGE header
    primary, offset = _read_header(url, 0)
    offset += _data_bytes(primary)
    header, image_start = _read_header(url, offset)
    if header.get("EXTNAME") != "IMAGE" or header["BITPIX"] != -32:
        raise IOError(f"unexpected file layout in {url}")

    # 2. which rows/columns of the detector hold our box
    width, height = header["NAXIS1"], header["NAXIS2"]
    x, y = WCS(header).all_world2pix(coord.ra.deg, coord.dec.deg, 0)
    half = int(np.ceil(box_arcmin * 60 / PIXEL_SCALE_ARCSEC / 2))
    x0, x1 = max(0, round(float(x)) - half), min(width, round(float(x)) + half + 1)
    y0, y1 = max(0, round(float(y)) - half), min(height, round(float(y)) + half + 1)
    if x0 >= x1 or y0 >= y1:
        raise IOError("position is not on this detector")

    # 3. those rows of IMAGE (big-endian float32, stored row by row)
    row_bytes = width * 4
    raw = _get_bytes(url, image_start + y0 * row_bytes, image_start + y1 * row_bytes)
    image = np.frombuffer(raw, ">f4").reshape(y1 - y0, width)[:, x0:x1].astype(np.float32)

    # ...and the same rows of FLAGS, which comes right after IMAGE
    flags_start = image_start + _padded(height * row_bytes)
    try:
        flags = _read_flag_rows(url, flags_start, y0, y1)[:, x0:x1]
    except Exception as exc:  # flags are nice to have, not essential
        print(f"   no FLAGS for {url.rsplit('/', 1)[-1]}: {exc}")
        flags = np.zeros_like(image, dtype=np.int32)

    # the cutout's WCS is the detector's WCS shifted by (x0, y0); the SIP
    # distortion terms are relative to CRPIX, so shifting CRPIX is enough
    header = header.copy()
    header["NAXIS1"], header["NAXIS2"] = x1 - x0, y1 - y0
    header["CRPIX1"] -= x0
    header["CRPIX2"] -= y0
    header["X0"], header["Y0"] = x0, y0  # the cutout's corner on the full detector
    return Cutout(image, flags, header)


def _read_flag_rows(url, start, y0, y1):
    """Rows y0:y1 of the compressed FLAGS layer that begins at byte `start`."""
    from astropy.io.fits.hdu.compressed._codecs import Rice1

    header, table_start = _read_header(url, start)
    if not (header.get("ZIMAGE") and header.get("ZCMPTYPE", "").strip() == "RICE_1"
            and header.get("ZTILE2") == 1):
        raise IOError("FLAGS is not stored as one RICE-compressed tile per row")

    # The table has one entry per detector row: (size, offset) of its tile.
    entry = header["NAXIS1"]  # 8 bytes (two int32) or 16 bytes (two int64)
    table = _get_bytes(url, table_start + y0 * entry, table_start + y1 * entry)
    tiles = np.frombuffer(table, ">i4" if entry == 8 else ">i8").reshape(-1, 2)

    # The tiles themselves sit in the "heap" after the table.
    heap = table_start + header.get("THEAP", header["NAXIS1"] * header["NAXIS2"])
    first, end = tiles[:, 1].min(), (tiles[:, 1] + tiles[:, 0]).max()
    blob = _get_bytes(url, heap + first, heap + end)

    params = {header[f"ZNAME{i}"].strip(): header[f"ZVAL{i}"]
              for i in range(1, 10) if f"ZNAME{i}" in header}
    bytepix = params.get("BYTEPIX", 4)
    codec = Rice1(blocksize=params.get("BLOCKSIZE", 32), bytepix=bytepix,
                  tilesize=header["ZTILE1"])
    rows = [np.asarray(codec.decode(np.frombuffer(blob[o - first:o - first + n], np.uint8)))
            .view(f"i{bytepix}") for n, o in tiles]
    return np.stack(rows).astype(np.int32)


# ---- small FITS / HTTP helpers ---------------------------------------------

def _get_bytes(url, start, end, attempts=4):
    """Bytes start..end-1 of the file at url (an HTTP range request)."""
    for attempt in range(attempts):
        try:
            r = _http.get(url, headers={"Range": f"bytes={start}-{end - 1}"}, timeout=60)
            r.raise_for_status()
            return r.content
        except requests.RequestException:
            if attempt == attempts - 1:
                raise
            time.sleep(1 + attempt)


def _read_header(url, start):
    """Parse the FITS header at byte `start`; return (header, where its data starts)."""
    buf = b""
    while True:
        chunk = _get_bytes(url, start + len(buf), start + len(buf) + 8 * BLOCK)
        buf += chunk
        for i in range(0, len(buf), 80):  # a header is 80-character cards ending in END
            if buf[i:i + 8] == b"END     ":
                size = (i // BLOCK + 1) * BLOCK
                return fits.Header.fromstring(buf[:size].decode("ascii")), start + size
        if len(chunk) < 8 * BLOCK:
            raise IOError(f"no FITS header at byte {start} of {url}")


def _data_bytes(header):
    """Size on disk of the data that follows `header` (0 for an empty HDU)."""
    if header["NAXIS"] == 0:
        return 0
    n = abs(header["BITPIX"]) // 8
    for i in range(1, header["NAXIS"] + 1):
        n *= header[f"NAXIS{i}"]
    return _padded(n)


def _padded(n):
    return -(-n // BLOCK) * BLOCK  # round up to whole 2880-byte blocks

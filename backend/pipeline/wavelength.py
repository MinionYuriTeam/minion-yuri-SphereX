# Wavelength of any detector pixel, from the WCS-WAVE table at the end of each file.

from astropy import units as u
from astropy.io import fits
from astropy.wcs import WCS

from .fetch import BLOCK, _data_bytes, _http, _read_header

_TABLES = {}   # (array, collection) -> spectral WCS


def _last_hdu_bytes(tail):
    """The last HDU, given the last few 2880-byte blocks of a FITS file."""
    for start in range(len(tail) - BLOCK, -1, -BLOCK):
        if tail[start:start + 9] == b"XTENSION=":
            return tail[start:]
    raise IOError("no HDU header in the last blocks of the file")


def _spectral_wcs(url):
    primary, offset = _read_header(url, 0)
    image_header, _ = _read_header(url, offset + _data_bytes(primary))
    r = _http.get(url, headers={"Range": f"bytes=-{4 * BLOCK}"}, timeout=60)  # end of file
    r.raise_for_status()
    table = fits.BinTableHDU.fromstring(_last_hdu_bytes(r.content))
    if table.header.get("EXTNAME") != "WCS-WAVE":
        raise IOError(f"last HDU of {url} is not WCS-WAVE")
    w = WCS(image_header, fobj=fits.HDUList([fits.PrimaryHDU(), table]), key="W")
    w.sip = None
    return w


def wavelength_at(exposure, x, y):
    """(central wavelength, bandwidth) in µm at 0-based FULL-detector pixel (x, y)."""
    key = (exposure["array"], exposure["collection"])
    if key not in _TABLES:
        _TABLES[key] = _spectral_wcs(exposure["aws_url"])
    lam, width = _TABLES[key].pixel_to_world(x, y)
    return float(lam.to_value(u.um)), float(width.to_value(u.um))
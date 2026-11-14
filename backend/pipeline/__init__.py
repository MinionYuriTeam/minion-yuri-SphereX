"""
SPHEREx data pipeline: sky position -> aligned, stacked images per epoch.

The steps, one file each:

    search.py   find every exposure covering the position (IRSA image search)
    fetch.py    download just the small square we need of each one (AWS)
    grid.py     resample every square onto one shared north-up grid
    stacks.py   group exposures into epochs and stack them -> get_stacks()
    render.py   turn the stacks into PNGs for the browser
    resolve.py  turn a typed name or coordinates into RA/Dec

Main entry points:

    from pipeline import get_stacks, resolve
"""

import warnings

from astropy.utils.exceptions import AstropyWarning
from astropy.wcs import FITSFixedWarning

# SPHEREx headers trigger harmless "fixed your header" notices from astropy.
warnings.simplefilter("ignore", FITSFixedWarning)
warnings.simplefilter("ignore", AstropyWarning)

from .flags import BAD_FOR_STACKING, FLAG_BITS, OVERLAY  # noqa: E402
from .resolve import BadInput, NotFound, ResolverUnavailable, resolve  # noqa: E402
from .search import SearchUnavailable, find_exposures  # noqa: E402
from .stacks import Epoch, Stacks, get_stacks  # noqa: E402

__all__ = ["get_stacks", "Stacks", "Epoch", "resolve", "find_exposures",
           "FLAG_BITS", "OVERLAY", "BAD_FOR_STACKING",
           "SearchUnavailable", "NotFound", "BadInput", "ResolverUnavailable"]

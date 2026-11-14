"""Constants shared by every step of the pipeline."""

from pathlib import Path

# IRSA collections to search. QR2 is no longer served; DR1 (to ~May 2026) and
# QR3 (after that) together cover the mission so far.
COLLECTIONS = ["spherex_dr1", "spherex_qr3"]

# One SPHEREx pixel is 6.15 arcseconds on the sky.
PIXEL_SCALE_ARCSEC = 6.15

# Everything we download or make goes under backend/output/<ra>_<dec>/.
OUTPUT_ROOT = Path(__file__).resolve().parent.parent / "output"


def position_dir(ra, dec):
    """Folder for one sky position, e.g. output/269.452075_4.693391/."""
    folder = OUTPUT_ROOT / f"{ra:.6f}_{dec:.6f}"
    folder.mkdir(parents=True, exist_ok=True)
    return folder

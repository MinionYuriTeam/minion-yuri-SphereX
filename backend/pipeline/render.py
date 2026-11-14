"""
Turn stacked epochs into PNGs for the browser.

Every epoch of an array uses the same brightness range (Stacks.display_range),
so a steady star has the same grey level in every frame. Images are flipped so
north is up in the PNG. The flags PNG is transparent except for pixels with
artifact bits (flags.OVERLAY), which are drawn red; lay it on top of the image.
"""

import numpy as np
from PIL import Image

from .flags import OVERLAY


def image_png(image, display_range, path):
    lo, hi = display_range
    scaled = np.clip((image - lo) / (hi - lo or 1.0), 0, 1)
    # SPHEREx stores saturated pixels (cores of bright stars) as NaN: show
    # them as white, the brightest value, not as black holes
    pixels = np.nan_to_num(scaled * 255, nan=255).astype(np.uint8)
    Image.fromarray(np.flipud(pixels), mode="L").save(path)
    return path


def flags_png(flags, path, mask=OVERLAY, color=(255, 60, 60, 170)):
    """Save the overlay, or return None if no pixel has an artifact bit."""
    hit = (flags & mask) != 0
    if not hit.any():
        return None
    rgba = np.zeros(flags.shape + (4,), dtype=np.uint8)
    rgba[hit] = color
    Image.fromarray(np.flipud(rgba), mode="RGBA").save(path)
    return path


def save_epoch_pngs(stacks, folder):
    """Write epoch_00.png, epoch_00_flags.png, ... into folder.
    Returns [(image_path, flags_path_or_None), ...] in epoch order."""
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob("epoch_*.png"):  # don't leave frames from a longer run
        old.unlink()
    out = []
    for i, epoch in enumerate(stacks.epochs):
        img = image_png(epoch.image, stacks.display_range, folder / f"epoch_{i:02d}.png")
        flg = flags_png(epoch.flags, folder / f"epoch_{i:02d}_flags.png")
        out.append((img, flg))
    return out

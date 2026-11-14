"""
Command-line tool: SPHEREx images of one sky position, aligned and sorted by date.

For each detector array it writes, into output/<ra>_<dec>/:

    D<n>_frames.png    every frame side by side, with dates
    D<n>_frames.gif    the frames as a blinking animation, oldest first
    D<n>_frames.fits   the frames as a cube (+ a DATES table), for astronomers

By default each frame is one *epoch* (a visit, all its exposures stacked).
--per-exposure shows every single exposure instead.

Examples:
    .venv/bin/python epochs.py                          # asks for RA / Dec
    .venv/bin/python epochs.py 269.452075 4.693391      # Barnard's Star, 3'
    .venv/bin/python epochs.py 269.452075 4.693391 --fov 12 --arrays 1 6
    .venv/bin/python epochs.py 269.452075 4.693391 --per-exposure

The work itself is done by the `pipeline` package; see pipeline/__init__.py.
"""

import argparse
import time

import numpy as np

from pipeline import get_stacks
from pipeline.settings import position_dir


def main():
    p = argparse.ArgumentParser(description="SPHEREx images of one position, by date")
    p.add_argument("ra", type=float, nargs="?", help="Right Ascension, degrees")
    p.add_argument("dec", type=float, nargs="?", help="Declination, degrees")
    p.add_argument("--fov", type=float, default=3.0,
                   help="width of the square in arcminutes (default 3)")
    p.add_argument("--arrays", type=int, nargs="+", default=[1, 2, 3, 4, 5, 6],
                   help="detector arrays to make, 1-6 (default all)")
    p.add_argument("--per-exposure", action="store_true",
                   help="one frame per exposure instead of one per epoch")
    a = p.parse_args()
    ra = a.ra if a.ra is not None else float(input("Enter Right Ascension (degrees): "))
    dec = a.dec if a.dec is not None else float(input("Enter Declination (degrees): "))

    folder = position_dir(ra, dec)
    for array in a.arrays:
        t0 = time.time()
        s = get_stacks(ra, dec, a.fov, array, per_exposure=a.per_exposure)
        if not s.epochs:
            print(f"D{array}: no usable images")
            continue
        save_contact_sheet(s, folder / f"D{array}_frames.png")
        save_gif(s, folder / f"D{array}_frames.gif")
        save_cube(s, folder / f"D{array}_frames.fits")
        size = s.epochs[0].image.shape[0]
        print(f"D{array} ({s.wavelength_um[0]}-{s.wavelength_um[1]} um): "
              f"{len(s.epochs)} frames of {size}x{size} px, "
              f"skipped {s.n_skipped}, failed {s.n_failed}, {time.time() - t0:.0f}s")
        for e in s.epochs:
            print(f"   {e.date[:16].replace('T', ' ')}  {e.n_exposures:3d} exposure(s)")
    print(f"Output in {folder}")


def save_contact_sheet(s, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    n = len(s.epochs)
    cols = min(n, 10)
    rows = -(-n // cols)
    fig, axes = plt.subplots(rows, cols, figsize=(cols * 1.6, rows * 1.8), squeeze=False)
    for ax in axes.flat:
        ax.axis("off")
    for ax, e in zip(axes.flat, s.epochs):
        ax.imshow(np.nan_to_num(e.image, nan=s.display_range[1]),  # NaN = saturated
                  origin="lower", cmap="gray", interpolation="nearest",
                  vmin=s.display_range[0], vmax=s.display_range[1])
        label = e.date[:10] if e.n_exposures == 1 else f"{e.date[:10]} ({e.n_exposures})"
        ax.set_title(label, fontsize=7)
    fig.suptitle(f"SPHEREx D{s.array}, {s.wavelength_um[0]}-{s.wavelength_um[1]} um: "
                 f"{n} frames (north up, east left)", fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def save_gif(s, path, target_px=300):
    from PIL import Image, ImageDraw

    lo, hi = s.display_range
    size = s.epochs[0].image.shape[0]
    zoom = max(1, target_px // size)
    frames = []
    for e in s.epochs:
        # saturated pixels are NaN in SPHEREx data: show them white
        pixels = np.nan_to_num(np.clip((e.image - lo) / (hi - lo), 0, 1) * 255, nan=255)
        im = Image.fromarray(np.flipud(pixels).astype(np.uint8))
        im = im.resize((size * zoom, size * zoom), Image.NEAREST).convert("RGB")
        ImageDraw.Draw(im).text((4, 4), f"D{s.array} {e.date[:10]}", fill=(255, 80, 80))
        frames.append(im)
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=500, loop=0)


def save_cube(s, path):
    from astropy.io import fits
    from astropy.table import Table

    header = s.epochs[0].wcs.to_header()
    header["ARRAY"] = (s.array, "SPHEREx detector array")
    header["BUNIT"] = "MJy / sr"
    header["COMMENT"] = "Axis 3 = frame, oldest first; dates in the DATES table"
    dates = Table({"date": [e.date for e in s.epochs],
                   "mjd": [e.mjd for e in s.epochs],
                   "n_exposures": [e.n_exposures for e in s.epochs]})
    fits.HDUList([fits.PrimaryHDU(np.stack([e.image for e in s.epochs]), header),
                  fits.BinTableHDU(dates, name="DATES")]).writeto(path, overwrite=True)


if __name__ == "__main__":
    main()

"""
Find every SPHEREx image covering a sky position, fetch small cutouts (not
full frames), reproject them onto one common north-up grid, and write the
aligned frames sorted by observation date, per detector array.

Based on the IRSA SPHEREx tutorial notebooks. Images are found with IRSA's
SIA2 service; pixels are read from IRSA's public AWS S3 copy of SPHEREx with
HTTP range requests (only the rows around the target, not the 65 MB file).
`--source irsa` uses IRSA's cutout service instead, which is often throttled.

Usage:
    python epochs.py                      # prompts for RA / Dec like main.py
    python epochs.py 269.452075 4.693391  # Barnard's Star
    python epochs.py 269.452075 4.693391 --size 3 --collections spherex_qr3
    python epochs.py 269.452075 4.693391 --oversample 4   # 4x finer grid
    python epochs.py 269.452075 4.693391 --full   # full 2040x2040 frames as GIFs

Output (in output/<ra>_<dec>/):
    epochs.csv          every epoch: detector, date, MJD, band, obs_id, url
    D<n>_aligned.fits   aligned frames per detector, date-sorted cube
                        (one row per frame in the DATES table extension)
    D<n>_frames.png     contact sheet of the aligned frames with dates
    D<n>_frames.gif     the aligned frames as an animation, oldest first
    cutouts/<src_size>/ cached raw cutouts, so re-runs skip the download
    D<n>_full.gif       with --full: whole detector frames, aligned, ~50 MB each
                        (frames are not cached; each --full run re-downloads)
"""

import argparse
import csv
import io
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import requests
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.table import Table, unique
from astropy.time import Time
from astropy.utils.exceptions import AstropyWarning
from astropy.wcs import WCS, FITSFixedWarning
from astroquery.ipac.irsa import Irsa
import warnings

warnings.simplefilter("ignore", FITSFixedWarning)
warnings.simplefilter("ignore", AstropyWarning)

# SPHEREx QR2 is no longer served by IRSA; DR1 + QR3 together cover the
# mission so far (DR1 ends around 2026W19, QR3 picks up after it).
DEFAULT_COLLECTIONS = ["spherex_dr1", "spherex_qr3"]
PIXEL_SCALE = 6.15 * u.arcsec  # SPHEREx native pixel
FITS_BLOCK = 2880


# --------------------------------------------------------------------------
# 1. Query: one row per (exposure, detector) covering the position
# --------------------------------------------------------------------------
def query_epochs(coord, collections=DEFAULT_COLLECTIONS):
    tables = []
    for collection in collections:
        res = Irsa.query_sia(pos=(coord, 1 * u.arcsec), collection=collection)
        if len(res):
            t = res["obs_id", "energy_bandpassname", "t_min", "t_max",
                    "em_min", "em_max", "access_url", "cloud_access",
                    "obs_collection", "dataproduct_subtype"]
            tables.append(Table(t))
    if not tables:
        return Table()

    from astropy.table import vstack
    t = vstack(tables, metadata_conflicts="silent")
    t = t[t["dataproduct_subtype"] == "science"]
    t["detector"] = [b.replace("SPHEREx-", "") for b in t["energy_bandpassname"]]
    t = unique(t, keys=["obs_id", "detector"], keep="first")
    t["date"] = Time(t["t_min"], format="mjd").isot
    t["aws_url"] = [aws_url(c) for c in t["cloud_access"]]
    t.sort(["detector", "t_min"])
    return t


def print_epochs(t):
    for det in sorted(set(t["detector"])):
        rows = t[t["detector"] == det]
        em = f"{rows['em_min'].min() * 1e6:.2f}-{rows['em_max'].max() * 1e6:.2f} um"
        print(f"\n{det}  ({len(rows)} epochs, {em})")
        for r in rows:
            print(f"   {r['date'][:19]}  MJD {r['t_min']:.5f}  {r['obs_id']}")


# --------------------------------------------------------------------------
# 2a. Cutouts from AWS S3: range-read only the rows around the target
# --------------------------------------------------------------------------
def aws_url(cloud_access):
    aws = json.loads(cloud_access)["aws"]
    return (f"https://{aws['bucket_name']}.s3.{aws['region']}.amazonaws.com/"
            f"{aws['key']}")


def _get_range(session, url, start, end, retries=4):
    for attempt in range(retries):
        try:
            r = session.get(url, headers={"Range": f"bytes={start}-{end}"},
                            timeout=60)
            r.raise_for_status()
            return r.content
        except requests.RequestException:
            if attempt == retries - 1:
                raise
            time.sleep(1 + attempt)


def _read_header(session, url, offset):
    """Read the FITS header starting at byte offset; return (header, data_offset)."""
    buf = b""
    while True:
        chunk = _get_range(session, url, offset + len(buf),
                           offset + len(buf) + 8 * FITS_BLOCK - 1)
        buf += chunk
        for i in range(0, len(buf), 80):
            if buf[i:i + 8] == b"END     ":
                n = (i // FITS_BLOCK + 1) * FITS_BLOCK
                return fits.Header.fromstring(buf[:n].decode("ascii")), offset + n
        if len(chunk) < 8 * FITS_BLOCK:
            raise IOError(f"no END card in header at {offset} of {url}")


_session = requests.Session()


def fetch_aws_cutout(url, coord, size_arcmin):
    """Return (data, header) for a size_arcmin box of the IMAGE extension."""
    primary, off = _read_header(_session, url, 0)
    psize = abs(primary["BITPIX"]) // 8 * int(np.prod(
        [primary[f"NAXIS{i}"] for i in range(1, primary["NAXIS"] + 1)] or [0]))
    off += int(np.ceil(psize / FITS_BLOCK)) * FITS_BLOCK
    hdr, data_off = _read_header(_session, url, off)
    if hdr.get("EXTNAME") != "IMAGE" or hdr["BITPIX"] != -32:
        raise IOError(f"unexpected first extension {hdr.get('EXTNAME')} in {url}")

    nx, ny = hdr["NAXIS1"], hdr["NAXIS2"]
    x, y = WCS(hdr).all_world2pix(coord.ra.deg, coord.dec.deg, 0)
    half = int(np.ceil(size_arcmin * 60 / PIXEL_SCALE.value / 2))
    xc, yc = int(round(float(x))), int(round(float(y)))
    x0, x1 = max(0, xc - half), min(nx, xc + half + 1)
    y0, y1 = max(0, yc - half), min(ny, yc + half + 1)
    if x0 >= x1 or y0 >= y1:
        raise IOError("target is off the detector")

    row = nx * 4  # big-endian float32
    raw = _get_range(_session, url, data_off + y0 * row, data_off + y1 * row - 1)
    data = np.frombuffer(raw, dtype=">f4").reshape(y1 - y0, nx)[:, x0:x1]
    data = data.astype(np.float32)

    hdr = hdr.copy()
    hdr["NAXIS1"], hdr["NAXIS2"] = x1 - x0, y1 - y0
    hdr["CRPIX1"] -= x0  # SIP terms are relative to CRPIX, so this is enough
    hdr["CRPIX2"] -= y0
    hdr["CUTX0"], hdr["CUTY0"] = x0, y0
    return data, hdr


# --------------------------------------------------------------------------
# 2b. Cutouts from IRSA's cutout service (often answers "server busy")
# --------------------------------------------------------------------------
def cutout_url(access_url, coord, size_arcmin):
    return (f"{access_url}?center={coord.ra.deg:.6f},{coord.dec.deg:.6f}"
            f"&size={size_arcmin}arcmin")


def fetch_cutout(url, size_arcmin, retries=6):
    """Return (data, header) of the IMAGE extension of a cutout."""
    npix = int(np.ceil(size_arcmin * 60 / PIXEL_SCALE.value)) + 2
    data_bytes = int(np.ceil(npix * npix * 4 / FITS_BLOCK)) * FITS_BLOCK
    need = 8 * FITS_BLOCK + data_bytes  # primary + IMAGE header + data

    for attempt in range(retries):
        try:
            with requests.get(url, stream=True, timeout=120) as r:
                if r.status_code == 503:  # "Server busy, retry later."
                    raise IOError("server busy")
                r.raise_for_status()
                buf = bytearray()
                for chunk in r.iter_content(64 * 1024):
                    buf.extend(chunk)
                    if len(buf) >= need:
                        try:
                            with fits.open(io.BytesIO(bytes(buf)),
                                           ignore_missing_end=True) as h:
                                hdu = h["IMAGE"]
                                info = hdu.fileinfo()
                                if info["datLoc"] + info["datSpan"] > len(buf):
                                    raise EOFError  # data not fully read yet
                                return hdu.data.astype(np.float32), hdu.header.copy()
                        except Exception:
                            need += 4 * FITS_BLOCK  # header bigger than guessed
                with fits.open(io.BytesIO(bytes(buf))) as h:
                    return h["IMAGE"].data.astype(np.float32), h["IMAGE"].header.copy()
        except (IOError, requests.RequestException) as exc:
            if attempt == retries - 1:
                raise
            time.sleep(min(5 * 2 ** attempt, 60))


def cached_cutout(row, coord, size_arcmin, cache_dir, source="aws"):
    path = cache_dir / f"{row['obs_id']}_{row['detector']}.fits"
    if path.exists():
        with fits.open(path) as h:
            return h[0].data, h[0].header
    if source == "aws":
        data, header = fetch_aws_cutout(row["aws_url"], coord, size_arcmin)
    else:
        data, header = fetch_cutout(
            cutout_url(row["access_url"], coord, size_arcmin), size_arcmin)
    fits.PrimaryHDU(data, header).writeto(path, overwrite=True)
    return data, header


# --------------------------------------------------------------------------
# 3. Alignment: reproject every cutout onto one north-up TAN grid
# --------------------------------------------------------------------------
def target_wcs(coord, size_arcmin, oversample=1):
    """North-up TAN grid centred on coord. oversample > 1 gives finer pixels
    than SPHEREx's native 6.15" (smoother/larger images, no new detail)."""
    scale = PIXEL_SCALE.to_value(u.deg) / oversample
    n = int(round(size_arcmin / 60 / scale))
    n += (n + 1) % 2  # odd, so the target sits on the centre pixel
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [coord.ra.deg, coord.dec.deg]
    w.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    w.wcs.cdelt = [-scale, scale]
    return w, (n, n)


def bilinear(img, x, y):
    ny, nx = img.shape
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    ok = (x0 >= 0) & (y0 >= 0) & (x0 < nx - 1) & (y0 < ny - 1)
    x0c, y0c = np.clip(x0, 0, nx - 2), np.clip(y0, 0, ny - 2)
    out = (img[y0c, x0c] * (1 - fx) * (1 - fy) + img[y0c, x0c + 1] * fx * (1 - fy)
           + img[y0c + 1, x0c] * (1 - fx) * fy + img[y0c + 1, x0c + 1] * fx * fy)
    out[~ok] = np.nan
    return out


def align(data, header, out_wcs, out_shape, rows_per_chunk=128):
    """Resample data onto out_wcs, a strip of rows at a time so that big
    (2041x2041) grids don't need ~600 MB of temporary arrays at once."""
    in_wcs = WCS(header)  # celestial WCS incl. SIP distortion
    ny, nx = out_shape
    out = np.empty(out_shape, dtype=np.float32)
    for y0 in range(0, ny, rows_per_chunk):
        y1 = min(ny, y0 + rows_per_chunk)
        yy, xx = np.mgrid[y0:y1, 0:nx]
        ra, dec = out_wcs.pixel_to_world_values(xx, yy)
        xin, yin = in_wcs.all_world2pix(ra, dec, 0, quiet=True)
        out[y0:y1] = bilinear(data, xin, yin)
    return out


# --------------------------------------------------------------------------
# 4. Outputs
# --------------------------------------------------------------------------
def stretch(img):
    finite = img[np.isfinite(img)]
    if finite.size == 0:
        return img, 0, 1
    bg = np.median(finite)
    img = img - bg
    lo, hi = np.nanpercentile(img, [5, 99.5])
    return img, lo, hi


def write_detector(det, frames, out_dir, out_wcs):
    frames.sort(key=lambda f: f["mjd"])
    cube = np.stack([f["image"] for f in frames])

    hdr = out_wcs.to_header()
    hdr["DETECTOR"] = det
    hdr["BUNIT"] = "MJy / sr"
    hdr["COMMENT"] = "Axis 3 = epoch, oldest first; see DATES extension"
    dates = Table({
        "index": np.arange(len(frames)),
        "date": [f["date"] for f in frames],
        "mjd": [f["mjd"] for f in frames],
        "obs_id": [f["obs_id"] for f in frames],
    })
    fits.HDUList([fits.PrimaryHDU(cube, hdr),
                  fits.BinTableHDU(dates, name="DATES")]).writeto(
        out_dir / f"{det}_aligned.fits", overwrite=True)

    # Contact sheet
    n = len(frames)
    cols = min(n, 10)
    rows = int(np.ceil(n / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(cols * 1.6, rows * 1.8),
                             squeeze=False)
    for ax in axes.flat:
        ax.axis("off")
    for ax, f in zip(axes.flat, frames):
        img, lo, hi = stretch(f["image"])
        ax.imshow(img, origin="lower", cmap="gray", vmin=lo, vmax=hi,
                  interpolation="nearest")
        ax.set_title(f["date"][:10], fontsize=7)
    fig.suptitle(f"SPHEREx {det}: {n} aligned epochs (north up, east left)",
                 fontsize=10)
    fig.tight_layout()
    fig.savefig(out_dir / f"{det}_frames.png", dpi=150)
    plt.close(fig)

    # Animation
    from PIL import Image, ImageDraw
    gif = []
    scale = max(1, 300 // cube.shape[2])
    for f in frames:
        img, lo, hi = stretch(f["image"])
        u8 = np.nan_to_num(np.clip((img - lo) / (hi - lo + 1e-12), 0, 1) * 255)
        im = Image.fromarray(np.flipud(u8).astype(np.uint8)).resize(
            (cube.shape[2] * scale, cube.shape[1] * scale), Image.NEAREST).convert("RGB")
        d = ImageDraw.Draw(im)
        d.text((4, 4), f"{det} {f['date'][:16]}", fill=(255, 80, 80))
        gif.append(im)
    gif[0].save(out_dir / f"{det}_frames.gif", save_all=True,
                append_images=gif[1:], duration=250, loop=0)


# --------------------------------------------------------------------------
# 5. Full-resolution mode: whole detector frames -> one big GIF per detector
# --------------------------------------------------------------------------
DETECTOR_PIX = 2040


def full_frame(row, coord, out_wcs, out_shape):
    """Fetch the whole IMAGE extension from AWS, align it, return a uint8 frame."""
    data, header = fetch_aws_cutout(row["aws_url"], coord, 1e4)  # 1e4' = all of it
    img, lo, hi = stretch(align(data, header, out_wcs, out_shape))
    u8 = np.nan_to_num(np.clip((img - lo) / (hi - lo + 1e-12), 0, 1) * 255)
    return header.get("DATE-AVG", row["date"]), np.flipud(u8).astype(np.uint8)


def write_full_gifs(epochs, coord, out_dir, workers, detectors=None):
    from PIL import Image, ImageDraw, ImageFont

    out_wcs, out_shape = target_wcs(coord, DETECTOR_PIX * PIXEL_SCALE.value / 60)
    font = ImageFont.load_default(size=48)
    failed = []
    for det in sorted(set(epochs["detector"])):
        if detectors and det not in detectors:
            continue
        rows = epochs[epochs["detector"] == det]  # already sorted by date
        t0 = time.time()
        frames = [None] * len(rows)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            jobs = {pool.submit(full_frame, r, coord, out_wcs, out_shape): i
                    for i, r in enumerate(rows)}
            for job in as_completed(jobs):
                i = jobs[job]
                try:
                    date, u8 = job.result()
                except Exception as exc:
                    failed.append((rows[i]["obs_id"], det, str(exc)))
                    continue
                im = Image.fromarray(u8, mode="L")
                ImageDraw.Draw(im).text((24, 16), f"{det}  {date[:16].replace('T', ' ')}",
                                        fill=255, font=font)
                frames[i] = im
        frames = [f for f in frames if f is not None]
        path = out_dir / f"{det}_full.gif"
        frames[0].save(path, save_all=True, append_images=frames[1:],
                       duration=250, loop=0)
        print(f"{det}: {len(frames)} full-res frames {out_shape[1]}x{out_shape[0]} "
              f"-> {path} ({path.stat().st_size / 1e6:.0f} MB, {time.time() - t0:.0f}s)")
    return failed


def run(ra, dec, size_arcmin=3.0, collections=DEFAULT_COLLECTIONS, workers=8,
        oversample=1, source="aws", full=False, detectors=None,
        out_root=Path(__file__).parent / "output"):
    coord = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame="icrs")
    out_dir = out_root / f"{ra:.6f}_{dec:.6f}"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Searching {', '.join(collections)} at {coord.to_string('hmsdms')} ...")
    epochs = query_epochs(coord, collections)
    if len(epochs) == 0:
        print("No images found.")
        return None
    print(f"Found {len(epochs)} images across "
          f"{len(set(epochs['detector']))} detector arrays.")
    print_epochs(epochs)

    with open(out_dir / "epochs.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["detector", "date", "mjd", "em_min_um", "em_max_um",
                    "obs_id", "collection", "aws_url", "cutout_url"])
        for r in epochs:
            w.writerow([r["detector"], r["date"], f"{r['t_min']:.6f}",
                        f"{r['em_min'] * 1e6:.3f}", f"{r['em_max'] * 1e6:.3f}",
                        r["obs_id"], r["obs_collection"], r["aws_url"],
                        cutout_url(r["access_url"], coord, size_arcmin)])

    if full:
        print(f"\nBuilding full-resolution GIFs from AWS ({len(epochs)} frames) ...")
        failed = write_full_gifs(epochs, coord, out_dir, min(workers, 4), detectors)
        for f in failed:
            print("   failed:", *f)
        return out_dir

    cache_dir = out_dir / "cutouts" / f"{source}_{size_arcmin}arcmin"
    cache_dir.mkdir(parents=True, exist_ok=True)
    out_wcs, out_shape = target_wcs(coord, size_arcmin, oversample)
    by_det, failed = {}, []
    print(f"\nFetching {len(epochs)} cutouts ({size_arcmin}' each, from {source}) ...")
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        jobs = {pool.submit(cached_cutout, r, coord, size_arcmin, cache_dir,
                            source): r
                for r in epochs}
        for i, job in enumerate(as_completed(jobs), 1):
            r = jobs[job]
            try:
                data, header = job.result()
            except Exception as exc:
                failed.append((r["obs_id"], r["detector"], str(exc)))
                continue
            by_det.setdefault(r["detector"], []).append({
                "image": align(data, header, out_wcs, out_shape),
                "date": header.get("DATE-AVG", r["date"]),
                "mjd": header.get("MJD-AVG", r["t_min"]),
                "obs_id": r["obs_id"],
            })
            if i % 25 == 0 or i == len(epochs):
                print(f"   {i}/{len(epochs)}")
    print(f"Fetched in {time.time() - t0:.0f}s")

    for det, frames in sorted(by_det.items()):
        write_detector(det, frames, out_dir, out_wcs)
        print(f"{det}: {len(frames)} aligned frames -> {out_dir / (det + '_aligned.fits')}")
    if failed:
        print(f"\n{len(failed)} cutouts failed:")
        for f in failed:
            print("  ", *f)
    return out_dir


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[1],
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("ra", type=float, nargs="?", help="Right Ascension (deg)")
    p.add_argument("dec", type=float, nargs="?", help="Declination (deg)")
    p.add_argument("--size", type=float, default=3.0, help="cutout size, arcmin")
    p.add_argument("--collections", nargs="+", default=DEFAULT_COLLECTIONS)
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--source", choices=["aws", "irsa"], default="aws",
                   help="where pixels come from (default: IRSA's AWS S3 copy)")
    p.add_argument("--oversample", type=int, default=1,
                   help="output pixels per SPHEREx pixel (default 1 = native)")
    p.add_argument("--full", action="store_true",
                   help="whole 2040x2040 detector frames as D<n>_full.gif (AWS only)")
    p.add_argument("--detectors", nargs="+", metavar="Dn",
                   help="only these detector arrays with --full, e.g. D3 D4")
    a = p.parse_args()
    ra = a.ra if a.ra is not None else float(input("Enter Right Ascension (degrees): "))
    dec = a.dec if a.dec is not None else float(input("Enter Declination (degrees): "))
    run(ra, dec, a.size, a.collections, a.workers, a.oversample, a.source, a.full,
        a.detectors)


if __name__ == "__main__":
    main()

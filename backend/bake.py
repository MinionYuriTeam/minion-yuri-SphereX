"""
Bake the 5 test targets into the frontend, so the public site plays them
without any backend running.

    cd backend
    .venv/bin/python bake.py                 # all 5 targets
    .venv/bin/python bake.py "WISE 0855"     # just one (name as in target.js)

What it makes, for each target in frontend/minion-yuri/src/data/target.js:
  - all 6 detector arrays at 2', 5' and 10'
  - the target's own (best) array also at 20' and 40'

Output goes to frontend/minion-yuri/public/baked/:
    index.json                          which target / array / FOV is baked
    <target>/D<array>_fov<fov>/frames.json   same JSON as GET /api/frames,
    <target>/D<array>_fov<fov>/epoch_00.png  but png_url is a path inside the site
    <target>/D<array>_fov<fov>/epoch_00_flags.png

Re-run it when the presets in target.js change, or to pick up new SPHEREx data,
then commit public/baked/. Bigger fields are made first so smaller ones reuse
their downloads.
"""

import json
import re
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from pipeline import get_stacks
from pipeline.render import save_epoch_pngs
from pipeline.spectrum import get_spectrum

FRONTEND = Path(__file__).resolve().parent.parent / "frontend" / "minion-yuri"
TARGETS_JS = FRONTEND / "src" / "data" / "target.js"
BAKED = FRONTEND / "public" / "baked"

ALL_ARRAYS_FOVS = [10, 5, 2]   # every array (largest first: smaller ones reuse downloads)
BEST_ARRAY_FOVS = [40, 20]     # extra fields of view for the target's own array


def read_targets():
    """The presets from target.js: name, ra, dec, array."""
    text = TARGETS_JS.read_text()
    pattern = re.compile(r'name:\s*"([^"]+)",\s*ra:\s*([-\d.]+),\s*dec:\s*([-\d.]+),\s*array:\s*(\d)')
    targets = [{"name": n, "ra": float(r), "dec": float(d), "array": int(a)}
               for n, r, d, a in pattern.findall(text)]
    if not targets:
        sys.exit(f"no targets found in {TARGETS_JS}")
    return targets


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def bake_one(target, array, fov):
    folder = BAKED / slug(target["name"]) / f"D{array}_fov{fov:g}"
    t0 = time.time()
    s = get_stacks(target["ra"], target["dec"], fov, array)
    if folder.exists():
        shutil.rmtree(folder)
    paths = save_epoch_pngs(s, folder)

    def rel(path):  # path inside the website, e.g. baked/wise-0855/D6_fov5/epoch_00.png
        return None if path is None else path.relative_to(FRONTEND / "public").as_posix()

    frames = {
        "array": array,
        "wavelength_um": list(s.wavelength_um),
        "epochs": [
            {"date": e.date[:10], "datetime": e.date, "date_start": e.date_start,
             "date_end": e.date_end, "n_exposures": e.n_exposures,
             "png_url": rel(img), "flags_png_url": rel(flg)}
            for e, (img, flg) in zip(s.epochs, paths)
        ],
        "ra": target["ra"], "dec": target["dec"], "fov": fov,
        "size_px": s.epochs[0].image.shape[0] if s.epochs else 0,
        "pixel_scale_arcsec": s.pixel_scale_arcsec,
        "display_range": list(s.display_range),
        "n_skipped": s.n_skipped, "n_failed": s.n_failed,
        "baked": True,
    }
    (folder / "frames.json").write_text(json.dumps(frames, indent=1))
    print(f"  D{array} {fov:>2}'  {len(s.epochs)} epochs  {frames['size_px']:>3}px  "
          f"skipped {s.n_skipped:>2}  failed {s.n_failed}  {time.time() - t0:5.1f}s", flush=True)
    return {"array": array, "fov": fov, "path": rel(folder / "frames.json"),
            "epochs": len(s.epochs), "complete": s.n_failed == 0}


def main():
    targets = read_targets()
    only = sys.argv[1:]
    BAKED.mkdir(parents=True, exist_ok=True)
    index_path = BAKED / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"targets": []}
    by_name = {t["name"]: t for t in index["targets"]}

    for target in targets:
        if only and target["name"] not in only:
            continue
        print(f"{target['name']}  ({target['ra']}, {target['dec']}), best array D{target['array']}")
        combos = []
        best_first = [target["array"]] + [a for a in range(1, 7) if a != target["array"]]
        for array in best_first:
            fovs = (BEST_ARRAY_FOVS if array == target["array"] else []) + ALL_ARRAYS_FOVS
            for fov in fovs:
                combos.append(bake_one(target, array, fov))
        by_name[target["name"]] = {**target, "slug": slug(target["name"]), "baked": combos}
        
        try:                                              # new: bake the spectrum too
            spectrum = get_spectrum(target["ra"], target["dec"])
            path = BAKED / slug(target["name"]) / "spectrum.json"
            path.write_text(json.dumps(spectrum))
            by_name[target["name"]]["spectrum"] = path.relative_to(FRONTEND / "public").as_posix()
            print(f"  spectrum: {len(spectrum['points'])} points, {spectrum['n_dropped']} dropped")
        except Exception as exc:
            print(f"  spectrum failed, frames are still baked: {exc}")

    index = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "targets": [by_name[t["name"]] for t in targets if t["name"] in by_name],
    }
    index_path.write_text(json.dumps(index, indent=1))
    size = sum(p.stat().st_size for p in BAKED.rglob("*") if p.is_file())
    print(f"\nWrote {index_path} ({size / 1e6:.1f} MB in public/baked)")
    incomplete = [(t["name"], c["array"], c["fov"]) for t in index["targets"]
                  for c in t["baked"] if not c["complete"]]
    if incomplete:
        print("Some exposures failed to download, re-run for:", incomplete)


if __name__ == "__main__":
    main()

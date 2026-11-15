"""Make false-colour frames without the frontend. Run from backend/:
    .venv/bin/python check_rgb.py                          # WISE 0855, arrays 6 4 2
    .venv/bin/python check_rgb.py 76.956526 30.401438 5 3 1
"""
import sys

from PIL import Image

from pipeline.rgb import save_rgb_pngs
from pipeline.settings import position_dir

args = sys.argv[1:]
ra, dec = (float(v) for v in args[:2]) if len(args) >= 2 else (133.757786, -7.242023)
arrays = tuple(int(v) for v in args[2:5]) if len(args) >= 5 else (6, 4, 2)
folder = position_dir(ra, dec) / "png" / f"rgb{''.join(map(str, arrays))}_fov5"

frames = save_rgb_pngs(ra, dec, 5, folder, arrays)
print(f"red = D{arrays[0]}, green = D{arrays[1]}, blue = D{arrays[2]}: {len(frames)} frame(s)")
for date, path in frames:
    big = path.with_name(path.stem + "_big.png")            # 8x larger, to look at
    im = Image.open(path)
    im.resize((im.width * 8, im.height * 8), Image.NEAREST).save(big)
    print(f"  {date}  {big}")
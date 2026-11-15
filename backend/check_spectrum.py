"""Quick look at the spectrum data without the frontend. Run from backend/:
    .venv/bin/python check_spectrum.py              # RW Aurigae
    .venv/bin/python check_spectrum.py 269.446074 4.770708
"""
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from pipeline.spectrum import get_spectrum

ra, dec = (float(v) for v in sys.argv[1:3]) if len(sys.argv) > 2 else (76.956526, 30.401438)
s = get_spectrum(ra, dec)
points = s["points"]
print(f"{len(points)} points, {s['n_dropped']} of {s['n_exposures']} exposures dropped")
for array in range(1, 7):
    w = [p["wavelength_um"] for p in points if p["array"] == array]
    print(f"  D{array}: {len(w):3d} points", f"{min(w):.3f}-{max(w):.3f} um" if w else "")

fig, ax = plt.subplots(figsize=(9, 4))
for visit in sorted({p["visit"] for p in points}):
    for quality, marker in (("good", "o"), ("bright", "x")):
        sel = [p for p in points if p["visit"] == visit and p["quality"] == quality]
        if sel:
            ax.errorbar([p["wavelength_um"] for p in sel], [p["flux_mjy"] for p in sel],
                        yerr=[p["error_mjy"] for p in sel], fmt=marker, color=f"C{visit}",
                        label=f"visit {visit} {quality} ({sel[0]['date']})")
ax.set(xlabel="wavelength (µm)", ylabel="flux (mJy)", yscale="log")
ax.legend(fontsize=7)
fig.tight_layout()
fig.savefig("spectrum_check.png", dpi=150)
print("wrote spectrum_check.png")
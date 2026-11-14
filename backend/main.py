import numpy as np
import matplotlib.pyplot as plt

from matplotlib.patches import Circle
from astropy.io import fits
from astropy.wcs import WCS
from astropy.coordinates import SkyCoord
from astropy import units as u
from astroquery.ipac.irsa import Irsa

# 1. User enters coordinates
ra = float(input("Enter Right Ascension (degrees): "))
dec = float(input("Enter Declination (degrees): "))

coord = SkyCoord(
    ra=ra*u.deg,
    dec=dec*u.deg,
    frame="icrs"
)

# 2. Search SPHEREx
print("\nSearching SPHEREx...")

results = Irsa.query_sia(
    pos=(coord, 1*u.arcmin),
    collection=["spherex_dr1", "spherex_qr3"]
)

if len(results) == 0:
    print("No images found.")
    exit()

print(f"Found {len(results)} observations.")

# 3. Retrieve first matching image
with fits.open(results["access_url"][0], memmap=False) as hdulist:
    data = hdulist[1].data.copy()
    header = hdulist[1].header.copy()

# 4. Convert sky coordinates to pixels
wcs = WCS(header)

x, y = wcs.world_to_pixel(coord)

ny, nx = data.shape

if not (0 <= x < nx and 0 <= y < ny):
    print("Selected coordinates are outside this image.")
    exit()

# 5. Display image and circle
fig, ax = plt.subplots(figsize=(10, 8))

ax.imshow(
    data,
    origin="lower",
    cmap="gray",
    vmin=np.nanpercentile(data, 5),
    vmax=np.nanpercentile(data, 99)
)


plt.axis("off")

# Save image with a name that includes the coordinates
plt.savefig("spherex_image_{:.6f}_{:.6f}.png".format(ra, dec), dpi=300, bbox_inches="tight", pad_inches=0.1)

plt.show()
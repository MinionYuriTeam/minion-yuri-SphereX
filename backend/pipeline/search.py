"""
Step 1: find every SPHEREx exposure that covers a sky position (F3).

We ask IRSA's image search (SIA2) for every image containing the position.
Each answer row is one *exposure* on one *detector array* (SPHEREx has six
arrays, D1-D6, short to long wavelength). We keep, per exposure: the array,
the date, the wavelength range, and a direct download link on AWS.

IRSA's servers often answer "502 Proxy Error" (on bad days 2 requests in 3);
each failure is quick and random, so we ask once for both collections and
retry up to SEARCH_ATTEMPTS times. The list is saved to exposures.csv. A list younger than REUSE_HOURS is reused
without asking IRSA (new SPHEREx data arrives weekly), and if IRSA is down an
older saved list is used.
"""

import csv
import io
import json
import random
import time

import requests
from astropy.io.votable import parse
from astropy.time import Time

from .settings import COLLECTIONS

SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
SEARCH_ATTEMPTS = 12
CSV_NAME = "exposures.csv"
REUSE_HOURS = 6
CSV_COLUMNS = ["array", "date", "mjd", "wavelength_min_um", "wavelength_max_um",
               "obs_id", "collection", "aws_url"]


class SearchUnavailable(RuntimeError):
    """IRSA's search is down and there is no saved list for this position."""


def find_exposures(coord, save_dir, collections=COLLECTIONS, reuse_hours=REUSE_HOURS):
    """All exposures covering `coord`, sorted by array then date.

    Returns a list of dicts with the keys in CSV_COLUMNS (array is an int,
    mjd and wavelengths are floats). Also saves them to save_dir/exposures.csv.
    """
    saved = save_dir / CSV_NAME
    if saved.exists() and time.time() - saved.stat().st_mtime < reuse_hours * 3600:
        return _read_csv(saved)
    try:
        exposures = _search_irsa(coord, collections)
    except requests.RequestException as exc:
        if not saved.exists():
            raise SearchUnavailable(
                "IRSA's image search is down and this position has not been "
                f"searched before. Try again in a few minutes. ({exc})") from exc
        print(f"IRSA search is down; using the saved list in {saved}")
        return _read_csv(saved)

    if exposures:
        _write_csv(saved, exposures)
    return exposures


def _search_irsa(coord, collections):
    found = {}
    for row in _query_sia(coord, collections):
        if str(row["dataproduct_subtype"]) != "science":
            continue
        array = int(str(row["energy_bandpassname"]).replace("SPHEREx-D", ""))
        key = (str(row["obs_id"]), array)
        if key in found:  # same exposure listed by two collections
            continue
        mjd = float(row["t_min"])
        found[key] = {
            "array": array,
            "date": Time(mjd, format="mjd").isot,
            "mjd": mjd,
            "wavelength_min_um": round(float(row["em_min"]) * 1e6, 3),
            "wavelength_max_um": round(float(row["em_max"]) * 1e6, 3),
            "obs_id": str(row["obs_id"]),
            "collection": str(row["obs_collection"]),
            "aws_url": _aws_url(str(row["cloud_access"])),
        }
    return sorted(found.values(), key=lambda e: (e["array"], e["mjd"]))


def _query_sia(coord, collections, attempts=SEARCH_ATTEMPTS):
    """One SIA2 request for images containing coord (1" circle), all
    collections at once; the answer is a VOTable."""
    params = [("POS", f"CIRCLE {coord.ra.deg} {coord.dec.deg} 0.000278"),
              ("RESPONSEFORMAT", "votable")] + [("COLLECTION", c) for c in collections]
    for attempt in range(1, attempts + 1):
        try:
            r = requests.get(SIA_URL, params=params, timeout=60)
            r.raise_for_status()
            return parse(io.BytesIO(r.content)).get_first_table().to_table(
                use_names_over_ids=True)
        except requests.RequestException as exc:
            if attempt == attempts:
                raise
            print(f"   IRSA search attempt {attempt} failed ({exc.__class__.__name__}), retrying")
            time.sleep(1 + random.random() * min(attempt, 4))


def _aws_url(cloud_access):
    """IRSA lists where each file lives on AWS S3; turn that into an https URL."""
    aws = json.loads(cloud_access)["aws"]
    return (f"https://{aws['bucket_name']}.s3.{aws['region']}.amazonaws.com/"
            f"{aws['key']}")


def _write_csv(path, exposures):
    with open(path, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(exposures)


def _read_csv(path):
    with open(path, newline="") as fh:
        rows = list(csv.DictReader(fh))
    for r in rows:
        r["array"] = int(r["array"])
        for key in ("mjd", "wavelength_min_um", "wavelength_max_um"):
            r[key] = float(r[key])
    return rows

"""
/api/resolve: turn what the user typed into a position (F1).

Accepts any of:
    "269.452075 4.693391"            decimal degrees (comma or space between)
    "08h55m10.831s -07d14m42.53s"    sexagesimal
    "08:55:10.83 -07:14:42.5"        sexagesimal with colons
    "Barnard's Star", "R Dra"        a name, looked up with CDS Sesame

Names also return the proper motion (mas/yr) and the position moved forward
to today (ra_now, dec_now). Catalogue positions are for the year 2000, and
fast stars have moved since: Barnard's Star by ~4.5', WISE 0855 by ~1.4'.
Sesame checks SIMBAD, NED and VizieR in turn.
"""

import math
import re
import xml.etree.ElementTree as ET
from urllib.parse import quote

import requests
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.time import Time

SESAME_URL = "https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?{}"
_DECIMAL_PAIR = re.compile(r"^\s*([+-]?\d+(?:\.\d+)?)\s*[,\s]\s*([+-]?\d+(?:\.\d+)?)\s*$")


class NotFound(LookupError):
    """Nothing matched the text."""


class BadInput(ValueError):
    """The text looks like coordinates but they are out of range."""


class ResolverUnavailable(RuntimeError):
    """The name service could not be reached."""


def resolve(text):
    """Return {query, name, ra, dec, pm_ra_mas_yr, pm_dec_mas_yr,
    ra_now, dec_now, source}. Coordinates typed in are used as they are."""
    text = text.strip()
    if not text:
        raise NotFound("empty query")
    coord = _parse_coordinates(text)
    if coord is not None:
        ra, dec = round(coord.ra.deg, 6), round(coord.dec.deg, 6)
        return {"query": text, "name": None, "ra": ra, "dec": dec,
                "pm_ra_mas_yr": None, "pm_dec_mas_yr": None,
                "ra_now": ra, "dec_now": dec, "source": "coordinates"}
    return _sesame(text)


def _parse_coordinates(text):
    match = _DECIMAL_PAIR.match(text)
    if match:
        ra, dec = float(match.group(1)), float(match.group(2))
        if 0 <= ra < 360 and -90 <= dec <= 90:
            return SkyCoord(ra * u.deg, dec * u.deg)
        raise BadInput("RA must be 0-360 and Dec -90..90 degrees")
    if re.search(r"\d", text) and re.search(r"[hms:°d]", text) and not re.search(r"[a-ce-gi-ln-rt-zA-Z]", text):
        try:
            return SkyCoord(text, unit=(u.hourangle, u.deg))
        except ValueError:
            return None
    return None


def _sesame(name):
    try:
        r = requests.get(SESAME_URL.format(quote(name)), timeout=20)
        r.raise_for_status()
    except requests.RequestException as exc:
        raise ResolverUnavailable(f"name lookup service unreachable: {exc}") from exc

    for resolver in ET.fromstring(r.content).iter("Resolver"):
        ra, dec = resolver.findtext("jradeg"), resolver.findtext("jdedeg")
        if ra is None or dec is None:
            continue
        pm_ra, pm_dec = resolver.findtext(".//pmRA"), resolver.findtext(".//pmDE")
        pm_ra = float(pm_ra) if pm_ra else None
        pm_dec = float(pm_dec) if pm_dec else None
        ra_now, dec_now = _move_to_today(float(ra), float(dec), pm_ra, pm_dec)
        return {
            "query": name,
            "name": (resolver.findtext("oname") or name).replace("NAME ", "").strip(),
            "ra": round(float(ra), 6),
            "dec": round(float(dec), 6),
            "pm_ra_mas_yr": pm_ra,
            "pm_dec_mas_yr": pm_dec,
            "ra_now": ra_now,
            "dec_now": dec_now,
            "source": f"sesame/{resolver.get('name', '?')}",
        }
    raise NotFound(f"no object called '{name}'")


def _move_to_today(ra, dec, pm_ra, pm_dec, catalogue_year=2000.0):
    """Shift a J2000 position by its proper motion (straight line; fine for
    decades). pm_ra is already multiplied by cos(dec), as catalogues give it."""
    if pm_ra is None or pm_dec is None:
        return round(ra, 6), round(dec, 6)
    years = Time.now().jyear - catalogue_year
    dec_now = dec + pm_dec * years / 3.6e6
    ra_now = ra + pm_ra * years / 3.6e6 / math.cos(math.radians(dec))
    return round(ra_now % 360, 6), round(dec_now, 6)

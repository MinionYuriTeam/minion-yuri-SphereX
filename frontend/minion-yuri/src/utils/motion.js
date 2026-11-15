// F11: where a moving star should be on a given date, and where that lands in our image.
//
// A star's catalogue entry is a position at one moment (J2000 here) plus its
// proper motion: how far it drifts across the sky each year. Moving it in a
// straight line is accurate to far below a SPHEREx pixel over a few decades.
//
// Our images (backend pipeline/grid.py) are square, north up, east left,
// centred on the view's RA/Dec, `size_px` pixels of `pixel_scale_arcsec`.

const DAY_MS = 86400000;
const J2000_MS = Date.UTC(2000, 0, 1, 12); // 2000 Jan 1, 12:00 UTC
const RAD = Math.PI / 180;

// "2025-08-30" or "2025-08-30T10:33:13.710" (UTC) -> 2025.66
export function decimalYear(date) {
  const iso = date.length <= 10 ? `${date}T00:00:00Z` : /Z|[+-]\d\d:?\d\d$/.test(date) ? date : `${date}Z`;
  return 2000 + (Date.parse(iso) - J2000_MS) / (365.25 * DAY_MS);
}

// track = { ra, dec, pmRa, pmDec, epoch? }: degrees, mas/yr (pmRa already × cos Dec)
export function positionAt(track, year) {
  const years = year - (track.epoch ?? 2000);
  const dec = track.dec + (track.pmDec * years) / 3.6e6;
  const ra = track.ra + (track.pmRa * years) / 3.6e6 / Math.cos(track.dec * RAD);
  return { ra: ((ra % 360) + 360) % 360, dec };
}

// Sky position -> place in the image as fractions: x 0 = left edge, y 0 = top edge.
// Gnomonic (TAN) projection around the image centre, the same as the backend's grid.
export function skyToImage({ ra, dec }, centre, widthArcsec) {
  const d0 = centre.dec * RAD, d = dec * RAD, dRa = (ra - centre.ra) * RAD;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(dRa);
  const xi = (Math.cos(d) * Math.sin(dRa)) / cosc;                                        // east, radians
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(dRa)) / cosc; // north
  const toArcsec = 180 / Math.PI * 3600;
  return {
    x: 0.5 - (xi * toArcsec) / widthArcsec,  // east is on the left
    y: 0.5 - (eta * toArcsec) / widthArcsec, // north is up
  };
}

// Where the star should be in every frame: [{x, y}] as image fractions (see skyToImage).
export function trackPoints(track, epochs, centre, widthArcsec) {
  if (!track || !widthArcsec || !epochs?.length) return [];
  return epochs.map((e) => skyToImage(positionAt(track, decimalYear(e.datetime || e.date)), centre, widthArcsec));
}

// How much sky an image from /api/frames (or /api/rgb, which has no size) spans
export function imageWidthArcsec(data, fov) {
  return data?.size_px && data?.pixel_scale_arcsec ? data.size_px * data.pixel_scale_arcsec : fov * 60;
}

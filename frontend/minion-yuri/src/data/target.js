// The 5 one-click test targets (F8). RA/Dec in decimal degrees.
//
// Positions are where each object is TODAY (catalogue position + proper motion,
// from the backend's /api/resolve -> ra_now/dec_now). Fast stars have moved since
// their year-2000 catalogue position: Barnard's Star by ~4.5', WISE 0855 by ~1.4',
// Epsilon Indi B by ~2', so the old positions put them off-centre or out of view.
//
// `array` = the detector array (1 short – 6 long wavelength) that shows it best.
// The backend caches results per exact position, so keep these numbers in sync
// with whatever was pre-cached on the server.
export const TARGETS = [
  { name: "Barnard's Star", ra: 269.446074, dec: 4.770708,   array: 1 },
  { name: "WISE 0855",      ra: 133.757786, dec: -7.242023,  array: 6 }, // only visible at long wavelengths
  { name: "Epsilon Indi B", ra: 331.0984,   dec: -56.801256, array: 3 },
  { name: "RW Aurigae",     ra: 76.956526,  dec: 30.401438,  array: 3 },
  { name: "R Draconis",     ra: 248.167611, dec: 66.754979,  array: 3 },
];

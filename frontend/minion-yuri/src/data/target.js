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
//
// `about` + `lookFor` are shown in the "This target" panel (TargetInfo.js).
// SPHEREx pixels are 6.2″, so a star moving 10″ a year shifts about 1.7 pixels a year.
export const TARGETS = [
  {
    name: "Barnard's Star", ra: 269.446074, dec: 4.770708, array: 1,
    about: "Red dwarf · 6 light-years away",
    lookFor: "The fastest-moving star in our sky: 10.3″ a year, about 1.7 SPHEREx pixels. Watch the bright star in the centre creep across the frame between visits.",
  },
  {
    name: "WISE 0855", ra: 133.757786, dec: -7.242023, array: 6, // only visible at long wavelengths
    about: "Coldest known brown dwarf · 7.4 light-years away",
    lookFor: "Only about 250–285 K, around the freezing point of water, so it's almost invisible at short wavelengths. It shows up in arrays 5–6. It also moves fast: 8.2″ a year, about 1.3 pixels.",
  },
  {
    name: "Epsilon Indi B", ra: 331.0984, dec: -56.801256, array: 3,
    about: "Pair of brown dwarfs · 12 light-years away",
    lookFor: "Two brown dwarfs only 0.7″ apart, so SPHEREx sees them as one dot. They orbit the bright star Epsilon Indi A, 6.7′ away: at 10′ or more its glare appears at the edge. Moves 4.7″ a year.",
  },
  {
    name: "RW Aurigae", ra: 76.956526, dec: 30.401438, array: 3,
    about: "Young T Tauri star · ~600 light-years away",
    lookFor: "It doesn't move, it changes brightness. Dust from its disk sometimes passes in front of it and dims it a lot. Compare how bright the centre star is between visits.",
  },
  {
    name: "R Draconis", ra: 248.167611, dec: 66.754979, array: 3,
    about: "Pulsating red giant (Mira variable) · ~2,200 light-years away",
    lookFor: "Its brightness rises and falls every ~246 days. It doesn't move: watch the centre star get brighter and dimmer between visits.",
  },
];

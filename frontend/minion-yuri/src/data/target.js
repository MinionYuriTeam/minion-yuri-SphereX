// The one-click targets (F8): the 5 test targets first, then more built-in ones. RA/Dec in decimal degrees.
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
// `track` = catalogue position at J2000 + proper motion (mas/yr, RA already × cos Dec),
// from SIMBAD via /api/resolve. The F11 marker moves it to each frame's date.
// `source` says where the proper motion comes from (Gaia DR3 where SIMBAD uses it).
//
// `about` + `lookFor` are shown in the "This target" panel (TargetInfo.js).
// SPHEREx pixels are 6.2″, so a star moving 10″ a year shifts about 1.7 pixels a year.
export const TARGETS = [
  {
    name: "Barnard's Star", ra: 269.446074, dec: 4.770708, array: 1,
    track: { ra: 269.452077, dec: 4.693365, pmRa: -801.551, pmDec: 10362.394, source: "Gaia DR3" },
    about: "Red dwarf · 6 light-years away",
    lookFor: "The fastest-moving star in our sky: 10.3″ a year, about 1.7 SPHEREx pixels. Watch the bright star in the centre creep across the frame between visits.",
  },
  {
    name: "WISE 0855", ra: 133.757786, dec: -7.242023, array: 6, // only visible at long wavelengths
    track: { ra: 133.818908, dec: -7.247048, pmRa: -8123.7, pmDec: 673.2, source: "SIMBAD (too faint for Gaia)" },
    about: "Coldest known brown dwarf · 7.4 light-years away",
    lookFor: "Only about 250–285 K, around the freezing point of water, so it's almost invisible at short wavelengths. It shows up in arrays 5–6. It also moves fast: 8.2″ a year, about 1.3 pixels.",
  },
  {
    name: "Epsilon Indi B", ra: 331.0984, dec: -56.801256, array: 3,
    track: { ra: 331.044147, dec: -56.782844, pmRa: 3981.977, pmDec: -2466.832, source: "Gaia DR3" },
    about: "Pair of brown dwarfs · 12 light-years away",
    lookFor: "Two brown dwarfs only 0.7″ apart, so SPHEREx sees them as one dot. They orbit the bright star Epsilon Indi A, 6.7′ away: at 10′ or more its glare appears at the edge. Moves 4.7″ a year. The red pixels are ones SPHEREx flagged as unreliable, mostly that glare; the flag button (top left of the picture) hides them.",
    showFlags: true, // F13: the preset turns the flags overlay on
  },
  {
    name: "RW Aurigae", ra: 76.956526, dec: 30.401438, array: 3,
    track: { ra: 76.956526, dec: 30.401438, pmRa: 7.23, pmDec: -20.33, source: "SIMBAD" },
    about: "Young T Tauri star · ~600 light-years away",
    lookFor: "It doesn't move, it changes brightness. Dust from its disk sometimes passes in front of it and dims it a lot. Compare how bright the centre star is between visits.",
  },
  {
    name: "R Draconis", ra: 248.167611, dec: 66.754979, array: 3,
    track: { ra: 248.167611, dec: 66.754979, pmRa: -20.643, pmDec: 6.149, source: "Gaia DR3" },
    about: "Pulsating red giant (Mira variable) · ~2,200 light-years away",
    lookFor: "Its brightness rises and falls every ~246 days. It doesn't move: watch the centre star get brighter and dimmer between visits.",
  },
  // ---- More built-in targets (baked like the 5 above, so they play without a backend) ----
  // `aliases` = other names the search box accepts for this target.
  {
    name: "Proxima Centauri", ra: 217.367717, dec: -62.673773, array: 2,
    track: { ra: 217.428942, dec: -62.67949, pmRa: -3781.741, pmDec: 769.465, source: "SIMBAD" },
    aliases: ["proxima", "alpha cen c"],
    about: "Red dwarf · the nearest star to the Sun, 4.2 light-years away",
    lookFor: "Moves 3.9″ a year, about 0.6 SPHEREx pixels: a small shift, easiest to see in Difference view. It's a flare star, so its brightness can change between visits too.",
  },
  {
    name: "Kapteyn's Star", ra: 77.987359, dec: -45.060852, array: 2,
    track: { ra: 77.919124, dec: -45.018434, pmRa: 6491.223, pmDec: -5708.614, source: "SIMBAD" },
    aliases: ["kapteyn", "hd 33793"],
    about: "Red subdwarf · 12.8 light-years away",
    lookFor: "The second-fastest star in our sky after Barnard's Star: 8.6″ a year, about 1.4 pixels. It's an old star from the Milky Way's halo, passing through.",
  },
  {
    name: "Luhman 16", ra: 162.294389, dec: -53.316814, array: 3,
    track: { ra: 162.328814, dec: -53.319466, pmRa: -2767.502, pmDec: 356.856, source: "SIMBAD" },
    aliases: ["luhman", "wise 1049"],
    about: "Pair of brown dwarfs · 6.5 light-years away",
    lookFor: "The nearest brown dwarfs, and the third-closest system to the Sun, found only in 2013. Moves 2.8″ a year, under half a pixel. Open the spectrum: brown dwarfs show deep water and methane dips.",
  },
  {
    name: "TRAPPIST-1", ra: 346.629312, dec: -5.044959, array: 3,
    track: { ra: 346.622369, dec: -5.041399, pmRa: 930.788, pmDec: -479.038, source: "SIMBAD" },
    aliases: ["trappist"],
    about: "Ultra-cool red dwarf with 7 Earth-sized planets · 40 light-years away",
    lookFor: "A faint dot in the centre. It moves 1.0″ a year, a sixth of a pixel, too little to see by eye here. The planets are far too faint and close to the star for SPHEREx.",
  },
  {
    name: "Orion Nebula", ra: 83.820112, dec: -5.387602, array: 4,
    aliases: ["orion", "m42", "m 42"],
    about: "Star-forming cloud · ~1,350 light-years away",
    lookFor: "Nothing moves here: this one is for colour. Glowing gas and dust around newborn stars. Use False colour and a 20′ or 40′ field of view.",
  },
  {
    name: "Andromeda Galaxy", ra: 10.684708, dec: 41.26875, array: 2,
    aliases: ["andromeda", "m31", "m 31"],
    about: "Nearest large galaxy · 2.5 million light-years away",
    lookFor: "This is the bright core; the whole galaxy is about 3° across, far bigger than our largest view. Use 40′ to see the glow fade outwards.",
  },
  {
    name: "Crab Nebula", ra: 83.6324, dec: 22.0174, array: 3,
    aliases: ["crab", "m1", "m 1"],
    about: "Supernova remnant · ~6,500 light-years away",
    lookFor: "The wreck of a star seen exploding in the year 1054. At 6.2″ a pixel it's a fuzzy patch about 6′ across: use 10′ or 20′.",
  },
  {
    name: "Wolf 359", ra: 164.091558, dec: 6.994666, array: 2,
    track: { ra: 164.120504, dec: 7.014723, pmRa: -3866.338, pmDec: -2699.215, source: "SIMBAD" },
    aliases: ["wolf", "cn leo"],
    about: "Red dwarf · 7.9 light-years away, one of the nearest stars",
    lookFor: "Moves 4.7″ a year, about three quarters of a pixel. Use the loupe or Difference view to catch the shift.",
  },
  {
    name: "61 Cygni", ra: 316.764424, dec: 38.773564, array: 2,
    track: { ra: 316.724748, dec: 38.749417, pmRa: 4164.209, pmDec: 3249.614, source: "SIMBAD" },
    aliases: ["61 cyg", "bessel's star", "piazzi's flying star"],
    about: "Pair of orange dwarfs · 11.4 light-years away",
    lookFor: "The first star whose distance was ever measured (1838). Two stars 30″ apart, about 5 pixels, moving together 5.3″ a year. They're bright, so the cores are saturated.",
  },
  {
    name: "Teegarden's Star", ra: 43.280343, dec: 16.853009, array: 2,
    track: { ra: 43.253716, dec: 16.881287, pmRa: 3429.083, pmDec: -3805.541, source: "SIMBAD" },
    aliases: ["teegarden", "gat 1370"],
    about: "Very faint red dwarf with Earth-mass planets · 12.5 light-years away",
    lookFor: "So faint it was only found in 2003, in asteroid-survey data. Moves 5.1″ a year, about 0.8 pixels.",
  },
  {
    name: "Ring Nebula", ra: 283.396251, dec: 33.029153, array: 4,
    aliases: ["ring", "m57", "m 57"],
    about: "Planetary nebula · ~2,500 light-years away",
    lookFor: "A shell of gas thrown off by a dying star. It's only about 1.5′ across, a dozen SPHEREx pixels: use 2′ or 5′ and the loupe.",
  },
  {
    name: "Carina Nebula", ra: 161.264612, dec: -59.6844, array: 4,
    aliases: ["carina", "eta carinae", "eta car"],
    about: "Giant star-forming cloud around Eta Carinae · ~7,500 light-years away",
    lookFor: "Centred on Eta Carinae, one of the most massive stars known and extremely bright in infrared. Try False colour at 20′ or 40′ for the surrounding cloud.",
  },
  {
    name: "Eagle Nebula", ra: 274.688001, dec: -13.792012, array: 4,
    aliases: ["eagle", "m16", "m 16", "pillars of creation"],
    about: "Star-forming cloud, home of the Pillars of Creation · ~5,700 light-years away",
    lookFor: "The famous pillars are only a few SPHEREx pixels wide, so look for the glowing cloud as a whole. Try False colour at 20′.",
  },
  {
    name: "Flame Nebula", ra: 85.4292, dec: -1.8417, array: 4,
    aliases: ["flame", "ngc 2024"],
    about: "Star-forming cloud in Orion · ~1,350 light-years away",
    lookFor: "Next to Orion's Belt. Dust hides it in visible light, but infrared sees through to the young stars inside. Try False colour at 10′ or 20′.",
  },
  {
    name: "Whirlpool Galaxy", ra: 202.469575, dec: 47.195258, array: 2,
    aliases: ["whirlpool", "m51", "m 51"],
    about: "Spiral galaxy pulling on a smaller neighbour · ~28 million light-years away",
    lookFor: "Two galaxies in one frame: the spiral in the centre and its companion about 4′ to the north. Use 10′ or 20′.",
  },
];

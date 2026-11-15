// Molecule bands drawn on the spectrum chart (F12).
// NASA doesn't send these: they are known lab wavelengths, hard-coded here.
//
// DRAFT, from memory: Dub (science lead) checks the wavelengths and widths.
// lo/hi in µm. SPHEREx is low resolution (~0.05–0.1 µm at these wavelengths),
// so each entry is a broad band, not a sharp line.

// Gas in the atmospheres of brown dwarfs and cool stars: what our 5 targets show
export const GAS_BANDS = [
  { name: "H₂O", lo: 1.33, hi: 1.48 },
  { name: "CH₄", lo: 1.6, hi: 1.75 },
  { name: "H₂O", lo: 1.8, hi: 2.0 },
  { name: "CH₄", lo: 2.2, hi: 2.4 },
  { name: "H₂O", lo: 2.6, hi: 2.9 },
  { name: "CH₄", lo: 3.2, hi: 3.45 },
  { name: "CO₂", lo: 4.2, hi: 4.35 },
  { name: "CO", lo: 4.5, hi: 4.8 },
];

// Ices on dust grains: what SPHEREx's ice survey looks for in cold clouds
export const ICE_BANDS = [
  { name: "H₂O solid", lo: 2.9, hi: 3.2 },
  { name: "CH₄ solid", lo: 3.27, hi: 3.37 },
  { name: "CH₃OH solid", lo: 3.47, hi: 3.59 },
  { name: "CO₂ solid", lo: 4.22, hi: 4.32 },
  { name: "CO solid", lo: 4.63, hi: 4.71 },
];

// F3/F5 detector-array selector (Must, Raman) + F10 false colour (uses GET /api/rgb)
// Props it gets from App.js: array (1–6), rgb (bool), onChange(array) picks one array,
// onColour() switches to false colour, wavelength ([lo, hi] µm of the current array,
// from the API; null while loading or in false colour)
//
// SPHEREx has 6 detector arrays, each covering a different infrared wavelength range.
// Always compare frames within one array: stars look very different between arrays.
// "False colour" is the 7th choice: three arrays at once as red, green and blue,
// so it replaces picking one array instead of sitting next to it.
import "../styles/FovPicker.css";

export const RGB_ARRAYS = [6, 4, 2]; // red, green, blue (what the backend bakes)

// approximate ranges, shown on the buttons; the exact range comes from the API
const ARRAYS = [
  { n: 1, um: "0.75–1.1" },
  { n: 2, um: "1.1–1.65" },
  { n: 3, um: "1.6–2.4" },
  { n: 4, um: "2.4–3.8" },
  { n: 5, um: "3.8–4.4" },
  { n: 6, um: "4.4–5.0" },
];

function BandPicker({ array, rgb, onChange, onColour, wavelength }) {
  const [r, g, b] = RGB_ARRAYS;
  return (
    <div className="fov">
      <span className="fov-label" data-tip="SPHEREx has 6 detectors, each seeing a different infrared colour">
        Detector array (wavelength)
        {rgb
          ? ` · false colour: red = ${r}, green = ${g}, blue = ${b}`
          : wavelength && wavelength[0] != null && ` · now ${wavelength[0]}–${wavelength[1]} µm`}
      </span>
      <div className="fov-buttons band-buttons">
        {ARRAYS.map((a) => (
          <button
            key={a.n}
            className={!rgb && a.n === array ? "active" : ""}
            onClick={() => onChange(a.n)}
            data-tip={`${a.n <= 2 ? "Short" : a.n <= 4 ? "Middle" : "Long"} infrared, ${a.um} µm${a.n >= 5 ? ". Cold brown dwarfs show up here" : ""}`}
          >
            {a.n} <small>{a.um} µm</small>
          </button>
        ))}
        <button
          className={`colour-button ${rgb ? "active" : ""}`}
          onClick={onColour}
          data-tip={`Arrays ${r}, ${g} and ${b} at once as red, green and blue. Cold objects look red, hot stars blue`}
        >
          False colour <small>{r} · {g} · {b}</small>
        </button>
      </div>
    </div>
  );
}

export default BandPicker;

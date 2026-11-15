// False-colour switch (uses GET /api/rgb from PR #9)
// Props it gets from App.js: on (bool), onChange(on)
//
// "One array" plays the frames of the detector array picked below.
// "False colour" puts three arrays into one picture: long infrared as red, middle as
// green, short as blue. Cold objects (brown dwarfs) come out red, hot stars blue.
import "../styles/FovPicker.css";
import "../styles/ColourMode.css";

export const RGB_ARRAYS = [6, 4, 2]; // red, green, blue (what the backend bakes)

function ColourMode({ on, onChange }) {
  return (
    <div className="fov">
      <span className="fov-label" data-tip="Show one detector at a time, or three detectors mixed into one colour picture">
        Picture
      </span>
      <div className="fov-buttons">
        <button className={on ? "" : "active"} onClick={() => onChange(false)}
          data-tip="Black-and-white frames from one detector array (pick it below)">
          One array
        </button>
        <button className={on ? "active" : ""} onClick={() => onChange(true)}
          data-tip="Arrays 6, 4 and 2 as red, green and blue. Cold objects look red, hot stars blue">
          False colour
        </button>
      </div>
      {on && (
        <p className="rgb-legend">
          <span className="rgb-r">Red = array {RGB_ARRAYS[0]}</span>
          <span className="rgb-g">Green = array {RGB_ARRAYS[1]}</span>
          <span className="rgb-b">Blue = array {RGB_ARRAYS[2]}</span>
        </p>
      )}
    </div>
  );
}

export default ColourMode;

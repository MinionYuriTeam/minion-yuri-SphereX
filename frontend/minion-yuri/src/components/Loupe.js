// Y — F6 zoom loupe
// Props it will get from App.js: pngUrl (the frame shown now)
// What it shows: the centre of the image, zoomed, no blur
import { useState, useRef } from "react";

function Loupe({ pngUrl }) {
  const ZOOM = 2.5;          // how much to magnify
  const SIZE = 220;          // loupe diameter in px

  const [pos, setPos] = useState(null); // {x, y} in px relative to image, or null when mouse is off
  const imgRef = useRef(null);

  const handleMove = (e) => {
    const rect = imgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPos({ x, y });
  };

  return (
    <div
      className="box loupe-container"
      onMouseMove={handleMove}
      onMouseLeave={() => setPos(null)}
      style={{ position: "relative", overflow: "hidden" }}
    >
      <img
        ref={imgRef}
        src={pngUrl}
        alt="NASA frame under loupe"
        style={{ width: "100%", display: "block" }}
      />

      {pos && (
        <div
          className="loupe-circle"
          style={{
            position: "absolute",
            left: pos.x - SIZE / 2,
            top: pos.y - SIZE / 2,
            width: SIZE,
            height: SIZE,
            borderRadius: "50%",
            border: "2px solid #6d4aff",
            boxShadow: "0 0 12px rgba(0,0,0,0.5)",
            backgroundImage: `url(${pngUrl})`,
            backgroundRepeat: "no-repeat",
            // push the background so the point under the cursor sits in the loupe centre
            backgroundPosition: `${SIZE / 2 - pos.x * ZOOM}px ${SIZE / 2 - pos.y * ZOOM}px`,
            backgroundSize: `${100 * ZOOM}% auto`,
            imageRendering: "pixelated", // no blur — keeps pixels crisp
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
export default Loupe;

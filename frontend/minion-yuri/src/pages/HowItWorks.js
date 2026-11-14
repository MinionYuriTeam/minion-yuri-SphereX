// PAGE — How it works (opened via #/how)
import "../styles/Pages.css";

function HowItWorks() {
  return (
    <article className="page">
      <a href="#/" className="back">← Back to the tool</a>
      <h2>How it works</h2>

      <ol className="steps">
        <li>
          <h3>1. Pick a patch of sky</h3>
          <p>Type a name like Barnard's Star, or a position in RA and Dec. You can also click one of the test targets.</p>
        </li>
        <li>
          <h3>2. Watch it blink</h3>
          <p>NASA's SPHEREx telescope photographs the whole sky about every six months. We play its pictures of
          your patch as a loop, oldest to newest.</p>
        </li>
        <li>
          <h3>3. Spot what changes</h3>
          <p>Most stars stay put. Anything that moves or gets brighter or dimmer jumps out. The movement is tiny,
          often only 1–2 pixels, so use the zoom loupe and difference mode.</p>
        </li>
      </ol>

      <h3>The controls</h3>
      <dl className="terms">
        <dt>Field of view</dt><dd>How big the patch is: 2, 5 or 10 arcminutes. The full Moon is about 30.</dd>
        <dt>Band</dt><dd>Which infrared "colour" you see. Cold objects like brown dwarfs only show up in the long bands (5–6).</dd>
        <dt>Difference</dt><dd>The newest picture minus the first one. What didn't change turns grey; a moving star becomes a bright/dark pair.</dd>
        <dt>Share</dt><dd>Copies a link that opens exactly what you are looking at.</dd>
      </dl>
    </article>
  );
}

export default HowItWorks;

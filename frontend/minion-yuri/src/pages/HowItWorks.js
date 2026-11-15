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
        <dt>Field of view</dt><dd>How big the patch is: 2, 5, 10, 20 or 40 arcminutes. The full Moon is about 30.</dd>
        <dt>Detector array</dt><dd>SPHEREx has 6 detector arrays, each seeing a different infrared wavelength range (1 = shortest, 0.75 µm; 6 = longest, 5 µm). Cold objects like brown dwarfs only show up on arrays 5–6.</dd>
        <dt>Crosshair</dt><dd>Marks the centre of the image, where your target is. Turn it off with the button in the corner of the image.</dd>
        <dt>Loupe</dt><dd>Hover the image to magnify it. Double-click to pin the lens on one spot.</dd>
        <dt>Difference</dt><dd>Shows the current picture minus the first picture. Stars that stay the same cancel out; anything that moved or changed brightness is left over.</dd>
        <dt>Share</dt><dd>Copies a link that opens exactly what you are looking at.</dd>
      </dl>

      <h3>The spectrum</h3>
      <p>Under the player is the target's spectrum: how bright it is at each infrared wavelength, from 750 to
      5000 nm. SPHEREx photographs every spot through slightly different colours of infrared, so all the
      pictures together tell us how much light the target gives off at each wavelength. Hot stars are brightest
      at the short end, cold brown dwarfs at the long end. Molecules in the target's air swallow light at their
      own wavelengths, which shows up as dips.</p>
      <dl className="terms">
        <dt>Curve</dt><dd>A smooth line through all the measurements. The fill under it goes from blue (short
        wavelengths) to red (long), the same colours as the detector arrays. Hover the graph to read the value
        at any wavelength.</dd>
        <dt>Dots</dt><dd>The measurements themselves, with error bars. Nearby measurements from the same visit
        are averaged into one dot so it stays readable.</dd>
        <dt>Yellow tags</dt><dd>The wavelengths (in nm) of the biggest peaks: where the target is brightest.</dd>
        <dt>Atmosphere</dt><dd>Shaded bands where water (H₂O), methane (CH₄), CO₂ and CO gas absorb light.
        Brown dwarfs like WISE 0855 and Epsilon Indi B have dips right in these bands.</dd>
        <dt>Solid</dt><dd>Where the same molecules absorb when frozen as ice on dust in cold clouds, which is what
        SPHEREx's ice survey looks for. Our 5 targets are too warm for ice, so these won't line up with them.</dd>
        <dt>Exposures per wavelength</dt><dd>The bar chart under the spectrum: how many SPHEREx exposures
        measured the target in each 50 nm slice. Tall bars mean that part of the curve is well measured; gaps
        mean there was no usable measurement there.</dd>
        <dt>Flux (mJy)</dt><dd>How bright the target is, in millijanskys, the usual unit for faint objects.
        Very bright stars use a log scale (10, 100, 1k…).</dd>
      </dl>
      <p>Some targets have few or no points: a star that is too bright saturates the detector (Barnard's Star,
      R Draconis), and exposures where the target sits on a bad pixel or a cosmic ray are skipped. The 5 test
      targets are built in; for any other spot, press <strong>Measure spectrum</strong>, which needs your own
      backend and takes a few minutes.</p>
    </article>
  );
}

export default HowItWorks;

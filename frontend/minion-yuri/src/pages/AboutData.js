// PAGE — About the data (opened via #/data)
import "../styles/Pages.css";

function AboutData() {
  return (
    <article className="page">
      <a href="#/" className="back">← Back to the tool</a>
      <h2>About the data</h2>

      <p>The images come from <strong>NASA's SPHEREx</strong> space telescope, which maps the whole sky in
      near-infrared light about every six months.</p>

      <dl className="terms">
        <dt>Source</dt><dd>SPHEREx Quick Release images from IRSA (NASA/IPAC Infrared Science Archive).</dd>
        <dt>Wavelengths</dt><dd>0.75 to 5 micrometres, split over 6 detectors (the 6 bands in the tool).</dd>
        <dt>Pixel size</dt><dd>6.2 arcseconds per pixel, so a moving star often shifts only 1–2 pixels.</dd>
        <dt>Updates</dt><dd>New images are released weekly; the tool always asks the archive for the latest.</dd>
        <dt>Star positions</dt><dd>Positions and motions from ESA's Gaia Data Release 3.</dd>
      </dl>

      <p className="credit">This research uses data from SPHEREx, provided by NASA/IPAC Infrared Science
      Archive (IRSA), and from the European Space Agency mission Gaia.</p>
    </article>
  );
}

export default AboutData;

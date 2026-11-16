import './styles/App.css';
import './styles/buttons.css';
import './styles/Slider.css';
import { useState, useEffect, useRef } from 'react';
import { TARGETS } from './data/target';
import { getFrames, getRgb, newJobId } from './api/frames';
import { imageWidthArcsec, trackPoints } from './utils/motion';

// SAM
import SearchBar from './components/SearchBar';     // F1
import Presets from './components/Presets';         // F8
import FovPicker from './components/FovPicker';     // F2
import BlinkPlayer from './components/BlinkPlayer'; // F4
import ShareLink from './components/ShareLink';     // F7
import HoverTips from './components/HoverTips';     // hover any control -> 1-line explanation
import TargetInfo from './components/TargetInfo';   // "This target" panel
import DownloadLog from './components/DownloadLog'; // live backend download log while loading
// SHOYA
import BandPicker, { RGB_ARRAYS } from './components/BandPicker'; // F3/F5 + F10 false colour (/api/rgb)
import RunBackendHelp from './components/RunBackendHelp'; // "start your own backend" help
import EasterEgg from './components/EasterEgg';           // ↑↑↓↓←→←→ B A Enter
import SpectrumChart from './components/SpectrumChart';   // F12 (/api/spectrum)
// JAY
import Loupe, { DEFAULT_LENS, LensOverlay, LensToggle } from './components/Loupe'; // F6
import ViewToggle from './components/ViewToggle';         // F9
import DifferenceView from './components/DifferenceView'; // F9
import GaiaMarker from './components/GaiaMarker';         // F11
import FlagsOverlay from './components/FlagsOverlay';     // F13
// PAGES (opened from the navbar)
import HowItWorks from './pages/HowItWorks';
import Team from './pages/Team';
import AboutData from './pages/AboutData';
import SkyMap from './pages/SkyMap';
import SpotTheMover from './pages/SpotTheMover'; // F15 game

const PAGES = {
  '#/how': HowItWorks,
  '#/team': Team,
  '#/data': AboutData,
  '#/sky': SkyMap,
  '#/game': SpotTheMover,
};

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  const num = (key, fallback) => {
    const value = Number(p.get(key));
    return p.get(key) === null || isNaN(value) ? fallback : value;
  };
  return {
    ra: num('ra', TARGETS[0].ra),
    dec: num('dec', TARGETS[0].dec),
    fov: num('fov', 5),
    array: num('array', TARGETS[0].array),
    rgb: num('rgb', 0), // 1 = false colour (arrays 6/4/2 as R/G/B)
  };
}

// layout=3 in the address bar = the 3-view layout; no layout = 2 views (the default)
function readLayout() {
  return new URLSearchParams(window.location.search).get('layout') === '3' ? 'three' : 'two';
}
// flags=1 in the address bar = the F13 flags overlay is on
function readFlags() {
  return new URLSearchParams(window.location.search).get('flags') === '1';
}
// everything the address bar (and the share link) carries
function urlParams(view, layout, flags) {
  return { ...view, ...(layout === 'three' ? { layout: 3 } : {}), ...(flags ? { flags: 1 } : {}) };
}
function urlQuery(view, layout, flags) {
  return '?' + new URLSearchParams(urlParams(view, layout, flags));
}

// shown while the backend works; the first load of a new spot can take up to a minute
// name + file name for the GIF export: the preset's name, or the position
function presetAt(view) {
  return TARGETS.find((t) => Math.abs(t.ra - view.ra) < 0.01 && Math.abs(t.dec - view.dec) < 0.01);
}
function gifLabel(view) {
  const where = presetAt(view)?.name || `${Number(view.ra).toFixed(4)}, ${Number(view.dec).toFixed(4)}`;
  const what = view.rgb ? `false colour R${RGB_ARRAYS[0]} G${RGB_ARRAYS[1]} B${RGB_ARRAYS[2]}` : `array ${view.array}`;
  return `${where} · ${what} · ${view.fov}′`;
}
function gifFileName(view) {
  const where = presetAt(view)?.name || `ra${Number(view.ra).toFixed(3)}_dec${Number(view.dec).toFixed(3)}`;
  const slug = where.toLowerCase().replace(/[^a-z0-9.+-]+/g, "-").replace(/^-|-$/g, "");
  const what = view.rgb ? `falsecolour${RGB_ARRAYS.join("")}` : `array${view.array}`;
  return `spherex-${slug}-${what}-${view.fov}arcmin.gif`;
}

function Loading({ job }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="status">
      <div className="status-spinner" aria-hidden="true" />
      <p><strong>Loading SPHEREx images… {seconds} s</strong></p>
      <p>
        {seconds < 8
          ? 'Lining up every visit to this spot.'
          : 'First time for this spot: downloading from NASA\'s archive. This can take up to a minute; next time it\'s instant.'}
      </p>
      <DownloadLog job={job} />
    </div>
  );
}

function App() {
  const [view, setView] = useState(readUrl);

  const [data, setData] = useState(null);         // the frames from the API
  const [index, setIndex] = useState(0);          // which frame is showing
  const [loadTime, setLoadTime] = useState(null); // seconds, shown next to Field of view
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState(null);           // id of the current load's backend log (DownloadLog)
  const [error, setError] = useState(null);       // Error from getFrames (err.code 'NO_BACKEND' = no backend running)
  const [retry, setRetry] = useState(0);          // bump to load the same view again
  const [viewMode, setViewMode] = useState('normal'); // F9: 'normal' | 'difference'
  const canDiff = data?.epochs?.length > 1;
  const [lens, setLens] = useState(DEFAULT_LENS);      // lens zoom + size, shared; each lens keeps its own spot
  const [mainLens, setMainLens] = useState(true);       // lens on the big picture on/off (2-view)
  const [searchTrack, setSearchTrack] = useState(null); // F11: proper motion of the last name searched
  const [layout, setLayout] = useState(readLayout);   // 'two': lens on the big picture · 'three': Loupe as its own picture
  const [showFlags, setShowFlags] = useState(readFlags); // F13: flagged pixels in red on the big picture
  const uiRef = useRef({ layout, showFlags });          // for the URL write in the frames effect (no refetch on layout/flags change)
  useEffect(() => {
    uiRef.current = { layout, showFlags };
    window.history.replaceState(null, '', urlQuery(view, layout, showFlags) + window.location.hash);
  }, [layout, showFlags]); // eslint-disable-line react-hooks/exhaustive-deps -- view's own effect keeps the URL in sync for view changes
  const frameUrl = data?.epochs?.[Math.min(index, (data?.epochs?.length || 1) - 1)]?.png_url;
  const showDiff = viewMode === 'difference' && canDiff;
  // F11: the star whose predicted track we draw: a preset's, or the last name searched
  const track = presetAt(view)?.track || searchTrack;
  const widthArcsec = imageWidthArcsec(data, view.fov);

  // every time the view changes (search, preset, FOV, array): load the frames
  useEffect(() => {
    const controller = new AbortController();     // cancels this request if the view changes again
    const start = performance.now();
    const jobId = newJobId();
    setJob(jobId);
    setLoading(true);
    setError(null);
    setData(null);

    const load = view.rgb ? getRgb({ ...view, arrays: RGB_ARRAYS }, { signal: controller.signal, job: jobId })
                          : getFrames(view, { signal: controller.signal, job: jobId });
    load
      .then((json) => {
        setData(json);
        setIndex(0);
        setLoadTime(((performance.now() - start) / 1000).toFixed(1));
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    window.history.replaceState(null, '', urlQuery(view, uiRef.current.layout, uiRef.current.showFlags) + window.location.hash);
    return () => controller.abort();
  }, [view, retry]);

  // which page is open: follows the part after # in the address bar
  const [page, setPage] = useState(window.location.hash);
  useEffect(() => {
    const onHashChange = () => setPage(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const Page = PAGES[page]; // undefined on the main tool

  // Open a built-in target (preset buttons, and the spots offered when a view isn't built in).
  // It opens on its own best array, so it also leaves false colour.
  // The flags overlay is never turned on for the visitor: only the flag button or ?flags=1 does.
  const pickTarget = (t) => {
    setView({ ...view, ra: t.ra, dec: t.dec, array: t.array ?? view.array, rgb: 0 });
  };

  return (
    <div className="app">
      <EasterEgg />
      <HoverTips />
      <header className="topbar">
        <div>
          <p className="eyebrow">NASA SPHEREx · Infrared sky explorer</p>
          <h1><a href="#/" className="home-link">SPHEREx Blink</a></h1>
        </div>

        <nav className="nav">
          <a href="#/sky">Sky map</a>
          <a href="#/game">Spot the mover</a>
          <a href="#/how">How it works</a>
          <a href="#/team">Team</a>
          <a href="#/data">About the data</a>
        </nav>
      </header>

      {Page ? (
        <Page />
      ) : (
        <>
        <p className="intro">
          hello world :) bye
          Type any position in the sky, or pick a famous object. We play NASA SPHEREx's infrared snapshots of
          that spot as a loop, so anything that <strong>moves</strong> or <strong>changes</strong> jumps out.
        </p>
        <p className="intro-hint">
          New here? Pick a famous object below, then <strong>hover any button</strong> for a one-line explanation.
          {' '}<a href="#/how">Full guide →</a>
        </p>

        <p>Now looking at: {Number(view.ra).toFixed(4)}°, {view.dec >= 0 ? '+' : ''}{Number(view.dec).toFixed(4)}° · FOV {view.fov}′</p>

        {/* 1. Find a patch of sky */}
        <section className="panel">
          <SearchBar
            targets={TARGETS}
            // a known target comes with its best array: go there (out of false colour);
            // plain coordinates keep whatever the visitor was looking at
            onSearch={({ ra, dec, array, track }) => {
              setSearchTrack(track || null);
              setView(array != null
                ? { ...view, ra, dec, array, rgb: 0 }
                : { ...view, ra, dec });
            }}
            onNoBackend={(err) => { setData(null); setError(err); }}
          />
          <Presets
            targets={TARGETS}
            current={view}
            onPick={pickTarget}
          />
        </section>

        {/* 2. Player on the left, info on the right (like the design) */}
        <div className="main">
          <section className="panel player-panel">
            {loading && <Loading job={job} />}

            {error?.code === 'NO_BACKEND' && (
              <RunBackendHelp
                api={error.api}
                presetName={TARGETS.find((t) => t.ra === view.ra && t.dec === view.dec)?.name}
                targets={TARGETS}
                onPick={pickTarget}
                onRetry={() => setRetry((r) => r + 1)}
              />
            )}

            {error && error.code !== 'NO_BACKEND' && (
              <div className="status status-error">
                <p><strong>Couldn't load this patch.</strong></p>
                <p>{error.message}</p>
                <button onClick={() => setRetry((r) => r + 1)}>Try again</button>
              </div>
            )}

            {data && (
              <BlinkPlayer
                epochs={data.epochs}
                index={index}
                setIndex={setIndex}
                gifTitle={gifLabel(view)}
                gifName={gifFileName(view)}
                gifTrack={trackPoints(track, data.epochs, view, widthArcsec)}
                gifZoom={lens.zoom}
                gifFlags={showFlags}
                centered={layout === 'three'}
                overlay={<>
                  <FlagsOverlay epochs={data.epochs} index={index} on={showFlags} setOn={setShowFlags} />
                  {layout === 'two' && frameUrl && mainLens && <LensOverlay lens={lens} setLens={setLens} src={frameUrl} />}
                  {layout === 'two' && <LensToggle on={mainLens} onChange={setMainLens} />}
                  <GaiaMarker
                    track={track}
                    epochs={data.epochs}
                    index={index}
                    centre={view}
                    widthArcsec={widthArcsec}
                    sizePx={data.size_px}
                  />
                </>}
                side={<>
                  <Loupe imageUrl={frameUrl} lens={lens} setLens={setLens} attached={layout === 'two'} />
                  {showDiff && (
                    <DifferenceView epochs={data.epochs} index={index} lens={lens} setLens={setLens} />
                  )}
                </>}
              >
                <FovPicker
                  fov={view.fov}
                  onChange={(f) => setView({ ...view, fov: f })}
                  loadTime={loadTime}
                />
                {/* inside the player, so on a phone it sits right under Field of view (not under the loupe) */}
                <div className="controls-wide">
                  <BandPicker
                    array={view.array}
                    rgb={Boolean(view.rgb)}
                    onChange={(a) => setView({ ...view, array: a, rgb: 0 })}
                    onColour={() => setView({ ...view, rgb: 1 })}
                    wavelength={data?.wavelength_um}
                  />
                </div>
              </BlinkPlayer>
            )}

            {/* while loading or after an error the player is hidden, so keep these reachable */}
            {!data && (
              <>
                <FovPicker fov={view.fov} onChange={(f) => setView({ ...view, fov: f })} loadTime={null} />
                <BandPicker
                  array={view.array}
                  rgb={Boolean(view.rgb)}
                  onChange={(a) => setView({ ...view, array: a, rgb: 0 })}
                  onColour={() => setView({ ...view, rgb: 1 })}
                  wavelength={null}
                />
              </>
            )}
            {data && <ViewToggle mode={viewMode} onChange={setViewMode} disabled={!canDiff}
              layout={layout} onLayout={setLayout} />}
          </section>

          <aside className="side-panels">
            <section className="panel">
              <TargetInfo view={view} targets={TARGETS} wavelength={data?.wavelength_um} />
            </section>
            <section className="panel">
              <ShareLink view={urlParams(view, layout, showFlags)} />
            </section>
          </aside>
        </div>

        {/* 3. Spectrum of the target across all six arrays */}
        <section className="panel">
          <SpectrumChart ra={view.ra} dec={view.dec} array={view.rgb ? null : view.array}
            ready={Boolean(data) && !loading && data.source === 'backend'}
            noBackend={error?.code === 'NO_BACKEND'}
            pm={track ? { pmRa: track.pmRa, pmDec: track.pmDec } : null} />
        </section>
        </>
      )}

      {/* Credits (on every page) */}
      <footer className="credits">
        Data: <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">NASA SPHEREx / IRSA</a>
        {' · '}Star positions: <a href="https://www.cosmos.esa.int/web/gaia/dr3" target="_blank" rel="noreferrer">ESA Gaia DR3</a>
        {' · '}Name lookup: <a href="https://cds.unistra.fr/cgi-bin/Sesame" target="_blank" rel="noreferrer">CDS Sesame / SIMBAD</a>
        {' · '}Made by team Minion Yuri for NASA Space Apps 2026
      </footer>
    </div>
  );
}

export default App;

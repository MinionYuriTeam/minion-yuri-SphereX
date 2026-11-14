import './styles/App.css';
import './styles/buttons.css';
import { useState, useEffect } from 'react';
import { TARGETS } from './data/target';
import { getFrames } from './api/frames';

// SAM
import SearchBar from './components/SearchBar';     // F1
import Presets from './components/Presets';         // F8
import FovPicker from './components/FovPicker';     // F2
import BlinkPlayer from './components/BlinkPlayer'; // F4
import ShareLink from './components/ShareLink';     // F7
// SHOYA
import BandPicker from './components/BandPicker';   // F3/F5, later F10
import RunBackendHelp from './components/RunBackendHelp'; // "start your own backend" help
// JAY
import Loupe from './components/Loupe';                   // F6
import ViewToggle from './components/ViewToggle';         // F9
import DifferenceView from './components/DifferenceView'; // F9
// PAGES (opened from the navbar)
import HowItWorks from './pages/HowItWorks';
import Team from './pages/Team';
import AboutData from './pages/AboutData';

const PAGES = {
  '#/how': HowItWorks,
  '#/team': Team,
  '#/data': AboutData,
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
  };
}

// shown while the backend works; the first load of a new spot can take up to a minute
function Loading() {
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
    </div>
  );
}

function App() {
  const [view, setView] = useState(readUrl);

  const [data, setData] = useState(null);         // the frames from the API
  const [index, setIndex] = useState(0);          // which frame is showing
  const [loadTime, setLoadTime] = useState(null); // seconds, shown next to Field of view
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);       // Error from getFrames (err.code 'NO_BACKEND' = no backend running)
  const [retry, setRetry] = useState(0);          // bump to load the same view again

  // every time the view changes (search, preset, FOV, array): load the frames
  useEffect(() => {
    const controller = new AbortController();     // cancels this request if the view changes again
    const start = performance.now();
    setLoading(true);
    setError(null);
    setData(null);

    getFrames(view, { signal: controller.signal })
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

    const query = '?' + new URLSearchParams(view);
    window.history.replaceState(null, '', query + window.location.hash);
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

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">NASA SPHEREx · Infrared sky explorer</p>
          <h1><a href="#/" className="home-link">SPHEREx Blink</a></h1>
        </div>

        <nav className="nav">
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
          Type any position in the sky, or pick a famous object. We play NASA SPHEREx's infrared snapshots of
          that spot as a loop, so anything that <strong>moves</strong> or <strong>changes</strong> jumps out.
        </p>

        <p>Now looking at: {view.ra}, {view.dec} · FOV {view.fov}′</p>

        {/* 1. Find a patch of sky */}
        <section className="panel">
          <SearchBar
            targets={TARGETS}
            onSearch={({ ra, dec, array }) => setView({ ...view, ra, dec, array: array ?? view.array })}
          />
          <Presets
            targets={TARGETS}
            current={view}
            onPick={(t) => setView({ ...view, ra: t.ra, dec: t.dec, array: t.array ?? view.array })}
          />
        </section>

        {/* 2. Player on the left, info on the right (like the design) */}
        <div className="main">
          <section className="panel player-panel">
            {loading && <Loading />}

            {error?.code === 'NO_BACKEND' && (
              <RunBackendHelp
                api={error.api}
                presetName={TARGETS.find((t) => t.ra === view.ra && t.dec === view.dec)?.name}
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
                side={<><Loupe imageUrl={data.epochs[index]?.png_url} /><DifferenceView /></>}
              >
                <FovPicker
                  fov={view.fov}
                  onChange={(f) => setView({ ...view, fov: f })}
                  loadTime={loadTime}
                />
              </BlinkPlayer>
            )}

            {/* while loading or after an error the player is hidden, so keep FOV reachable */}
            {!data && (
              <FovPicker fov={view.fov} onChange={(f) => setView({ ...view, fov: f })} loadTime={null} />
            )}

            <BandPicker
              array={view.array}
              onChange={(a) => setView({ ...view, array: a })}
              wavelength={data?.wavelength_um}
            />
            <ViewToggle />
          </section>

          <aside className="side-panels">
            <section className="panel">
              <ShareLink view={view} />
            </section>
          </aside>
        </div>
        </>
      )}
    </div>
  );
}

export default App;
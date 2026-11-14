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

function App() {
  const [view, setView] = useState({
    ra: TARGETS[0].ra,
    dec: TARGETS[0].dec,
    fov: 5,
    array: 3,
  });

  const [data, setData] = useState(null);         // the frames from the API (mock for now)
  const [index, setIndex] = useState(0);          // which frame is showing
  const [loadTime, setLoadTime] = useState(null); // seconds, shown next to Field of view

  // every time the view changes (search, preset, FOV): load the frames
  useEffect(() => {
    const start = performance.now();
    getFrames(view).then((json) => {
      setData(json);
      setIndex(0);
      setLoadTime(((performance.now() - start) / 1000).toFixed(1));
    });
  }, [view]);

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
            onSearch={({ ra, dec }) => setView({ ...view, ra, dec })}
          />
          <Presets
            targets={TARGETS}
            current={view}
            onPick={(t) => setView({ ...view, ra: t.ra, dec: t.dec })}
          />
        </section>

        {/* 2. Player on the left, info on the right (like the design) */}
        <div className="main">
          <section className="panel player-panel">
            {data && (
              <BlinkPlayer
                epochs={data.epochs}
                index={index}
                setIndex={setIndex}
                fov={view.fov}
                side={<><Loupe /><DifferenceView /></>}
              >
                <FovPicker
                  fov={view.fov}
                  onChange={(f) => setView({ ...view, fov: f })}
                  loadTime={loadTime}
                />
              </BlinkPlayer>
            )}

            <BandPicker />
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
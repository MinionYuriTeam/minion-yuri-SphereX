import './App.css';

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

function App() {
  // TODO (Sam): shared state goes here
  //   view  = { ra, dec, fov, array }   (also in the URL for F7)
  //   data  = answer from getFrames(view)  -> src/api/frames.js (mock for now)
  //   index = which frame is shown now (shared by player, loupe, difference)
  //   mode  = 'normal' | 'difference'

  return (
    <div className="app">
      <h1>SPHEREx Blink</h1>

      {/* 1. Find a patch of sky */}
      <section className="panel">
        <SearchBar />
        <Presets />
      </section>

      {/* 2. Look at it */}
      <section className="panel">
        <div className="row">
          <FovPicker />
          <BandPicker />
        </div>

        <div className="row">
          <BlinkPlayer />
          <Loupe />
          <DifferenceView />
        </div>

        <ViewToggle />
      </section>

      {/* 3. Share it */}
      <section className="panel">
        <ShareLink />
      </section>
    </div>
  );
}

export default App;

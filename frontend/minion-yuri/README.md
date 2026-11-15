# Minion Yuri – SPHEREx Blink (frontend)

React app (Create React App). Shows a blinking loop of SPHEREx images for any patch of sky.

## Start

```bash
npm install
npm start
```
Opens http://localhost:3000. It needs the backend running at
http://localhost:8000 (see the [root README](../../README.md#1-run-the-backend)).

Settings go in `.env.local` (copy `.env.example`), then restart `npm start`:

- `REACT_APP_API_URL`: backend address (default `http://localhost:8000`)
- `REACT_APP_USE_MOCK=true`: use `public/mock/frames.json`, no backend needed

## Where things live

```
public/mock/frames.json   fake /api/frames answer (REACT_APP_USE_MOCK=true)
src/
  App.js                  SAM  – shared state, layout, URL sync, loading / error states
  App.css                 shared styles
  api/frames.js           the ONLY file that fetches: getFrames(), resolveName()
  data/target.js          the 5 test targets (today's positions + best array)
  components/
    SearchBar.js          SAM   F1  presets / RA, Dec instantly; names + sexagesimal via /api/resolve
    FovPicker.js          SAM   F2  2 / 5 / 10 / 20 / 40 arcmin
    BlinkPlayer.js        SAM   F4  the blink loop + controls
    ShareLink.js          SAM   F7  copyable link
    Presets.js            SAM   F8  5 one-click targets
    BandPicker.js         RAMAN F3/F5 array 1–6 buttons; SHOYA: extend for F10 wavelength view
    Loupe.js              JAY   F6  zoom on the centre
    ViewToggle.js         JAY   F9  Normal / Difference switch
    DifferenceView.js     JAY   F9  now − first picture
```

## Rules

- Only edit your own files. Need data? Ask Sam to pass it from `App.js` as a prop.
- Components never `fetch` — only `api/frames.js` does.
- Work on a branch (`git checkout -b jay-loupe`), merge to `main` only when it works.
- Blocked for 30+ minutes? Say it in the group chat.

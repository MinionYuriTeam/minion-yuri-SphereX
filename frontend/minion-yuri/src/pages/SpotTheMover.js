// PAGE — Spot the mover (F15, opened via #/game)
//
// A game: we show a random patch of SPHEREx sky blinking between visits, and
// the player clicks the star that moves. The answer is checked against the
// catalogue: where Gaia DR3 (or SIMBAD) says the star was on each picture's
// date, from its position + proper motion (utils/motion.js, same as F11).
//
// Works with no backend: the patches are cut from the 20′ pictures baked into
// the site (public/baked/, see api/frames.js). Each patch is a random square
// of that picture, randomly flipped, so the mover is never just "the one in
// the middle".
//
// One round = 5 patches. Up to 3 tries per patch: 100 / 50 / 25 points.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TARGETS } from "../data/target";
import { getBakedIndex } from "../api/frames";
import { trackPoints, imageWidthArcsec } from "../utils/motion";
import "../styles/Pages.css";
import "../styles/SpotTheMover.css";

const PUBLIC = process.env.PUBLIC_URL || "";
const PATCHES_PER_ROUND = 5;
const SOURCE_FOV = 20;      // arcmin: the baked picture we cut patches from
const PATCH_FRACTION = 0.4; // patch = 40% of it, about 8′ across
const TOLERANCE_PX = 3;     // a click within 3 SPHEREx pixels (~18″) counts
const MARGIN_PX = 8;        // keep the mover at least this far from the patch edge
const FPS = 2;
const POINTS = [100, 50, 25];

// Which arrays show each mover well (WISE 0855 is only visible at long wavelengths)
const MOVERS = [
  { name: "Barnard's Star", arrays: [1, 2, 3] },
  { name: "WISE 0855", arrays: [5, 6] },
  { name: "Epsilon Indi B", arrays: [3] },
  { name: "Kapteyn's Star", arrays: [1, 2, 3] },
];

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// 5 different (star, array) pairs, every mover at least once when possible
function pickRound(index) {
  const options = [];
  for (const m of MOVERS) {
    const target = TARGETS.find((t) => t.name === m.name);
    const baked = index.targets.find((t) => t.name === m.name);
    if (!target || !baked) continue;
    for (const array of m.arrays) {
      const combo = baked.baked.find((c) => c.array === array && c.fov === SOURCE_FOV && c.epochs > 1);
      if (combo) options.push({ target, array, path: combo.path });
    }
  }
  const firsts = shuffle(MOVERS.map((m) => options.filter((o) => o.target.name === m.name)).filter((l) => l.length).map((l) => shuffle(l)[0]));
  const rest = shuffle(options.filter((o) => !firsts.includes(o)));
  return shuffle([...firsts, ...rest].slice(0, PATCHES_PER_ROUND));
}

// Load one patch: frames.json + every picture, then a random square that contains the mover's track
async function loadPatch(choice, signal) {
  const res = await fetch(`${PUBLIC}/${choice.path}`, { signal });
  if (!res.ok) throw new Error("Could not load the built-in pictures.");
  const data = await res.json();
  const images = await Promise.all(
    data.epochs.map(
      (e) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Could not load a picture."));
          img.src = `${PUBLIC}/${e.png_url}`;
        })
    )
  );
  const size = data.size_px || images[0].naturalWidth;
  const widthArcsec = imageWidthArcsec(data, SOURCE_FOV);
  // predicted position on each picture's date, in source pixels
  const track = trackPoints(choice.target.track, data.epochs, data, widthArcsec).map((p) => ({ x: p.x * size, y: p.y * size }));
  const crop = Math.round(size * PATCH_FRACTION);
  const xs = track.map((p) => p.x), ys = track.map((p) => p.y);
  const range = (lo, hi) => {
    const min = Math.max(0, Math.ceil(hi + MARGIN_PX - crop));
    const max = Math.min(size - crop, Math.floor(lo - MARGIN_PX));
    return max >= min ? Math.round(rand(min, max)) : Math.round(Math.min(Math.max((lo + hi) / 2 - crop / 2, 0), size - crop));
  };
  return {
    ...choice,
    epochs: data.epochs,
    images,
    track,
    crop: { x: range(Math.min(...xs), Math.max(...xs)), y: range(Math.min(...ys), Math.max(...ys)), size: crop },
    flipX: Math.random() < 0.5,
    flipY: Math.random() < 0.5,
    pixelArcsec: data.pixel_scale_arcsec || widthArcsec / size,
  };
}

// source pixel <-> patch fraction (0..1), with the patch's flips
function toPatch(p, patch) {
  const { crop, flipX, flipY } = patch;
  const fx = (p.x - crop.x) / crop.size, fy = (p.y - crop.y) / crop.size;
  return { x: flipX ? 1 - fx : fx, y: flipY ? 1 - fy : fy };
}
function fromPatch(f, patch) {
  const { crop, flipX, flipY } = patch;
  return { x: crop.x + (flipX ? 1 - f.x : f.x) * crop.size, y: crop.y + (flipY ? 1 - f.y : f.y) * crop.size };
}

function SpotTheMover() {
  const [round, setRound] = useState(null);   // the 5 choices
  const [n, setN] = useState(0);              // which patch (0-4)
  const [patch, setPatch] = useState(null);   // the loaded patch
  const [error, setError] = useState(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [clicks, setClicks] = useState([]);   // [{x, y, hit}] as patch fractions
  const [results, setResults] = useState([]); // per patch: { name, array, points, tries, found }
  const [game, setGame] = useState(0);        // bump for Play again
  const canvasRef = useRef(null);

  const misses = clicks.filter((c) => !c.hit).length;
  const found = clicks.some((c) => c.hit);
  const done = found || misses >= POINTS.length;
  const finished = results.length === PATCHES_PER_ROUND;

  // a new round
  useEffect(() => {
    let live = true;
    setRound(null); setN(0); setResults([]); setError(null);
    getBakedIndex().then((index) => {
      if (!live) return;
      const r = pickRound(index);
      if (r.length) setRound(r);
      else setError(new Error("The built-in pictures are missing."));
    });
    return () => { live = false; };
  }, [game]);

  // load the current patch
  useEffect(() => {
    if (!round || n >= round.length) return;
    const controller = new AbortController();
    setPatch(null); setClicks([]); setFrame(0); setPlaying(true); setError(null);
    loadPatch(round[n], controller.signal)
      .then(setPatch)
      .catch((err) => { if (err.name !== "AbortError") setError(err); });
    return () => controller.abort();
  }, [round, n]);

  // blink
  useEffect(() => {
    if (!patch || !playing) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % patch.images.length), 1000 / FPS);
    return () => clearInterval(timer);
  }, [patch, playing]);

  // draw the patch, pixel-sharp
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !patch) return;
    const { crop, flipX, flipY } = patch;
    canvas.width = crop.size;
    canvas.height = crop.size;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(flipX ? -1 : 1, 0, 0, flipY ? -1 : 1, flipX ? crop.size : 0, flipY ? crop.size : 0);
    ctx.drawImage(patch.images[frame], crop.x, crop.y, crop.size, crop.size, 0, 0, crop.size, crop.size);
  }, [patch, frame]);

  const onPick = useCallback(
    (event) => {
      if (!patch || done) return;
      const box = event.currentTarget.getBoundingClientRect();
      const f = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
      const src = fromPatch(f, patch);
      // checked against the catalogue position on the date of the picture showing
      const want = patch.track[frame];
      const hit = Math.hypot(src.x - want.x, src.y - want.y) <= TOLERANCE_PX;
      const next = [...clicks, { ...f, hit }];
      setClicks(next);
      const nextMisses = next.filter((c) => !c.hit).length;
      if (hit || nextMisses >= POINTS.length) {
        setResults((r) => [...r, {
          name: patch.target.name,
          array: patch.array,
          found: hit,
          tries: next.length,
          points: hit ? POINTS[next.length - 1] : 0,
        }]);
      }
    },
    [patch, done, frame, clicks]
  );

  const score = results.reduce((s, r) => s + r.points, 0);
  const track = useMemo(() => (patch ? patch.track.map((p) => toPatch(p, patch)) : []), [patch]);
  // after 2 misses: a dashed circle around where to look (not centred on the star)
  const hint = useMemo(() => {
    if (!patch) return null;
    const r = 0.16, angle = rand(0, Math.PI * 2), off = rand(0, r * 0.55);
    const c = track[0];
    return { x: c.x + Math.cos(angle) * off, y: c.y + Math.sin(angle) * off, r };
  }, [patch, track]);

  const target = patch?.target;
  const exploreUrl = target ? `?${new URLSearchParams({ ra: target.ra, dec: target.dec, fov: 5, array: patch.array })}#/` : "#/";
  const date = patch?.epochs[frame]?.date;

  return (
    <article className="page game">
      <a href="#/" className="back">← Back to the tool</a>
      <h2>Spot the mover</h2>
      <p>
        Each picture is a random patch of sky that SPHEREx photographed on different dates. One star in it is a
        nearby star or brown dwarf that <strong>moves</strong> between visits, by only a pixel or two.
        Watch the blink and <strong>click the star that moves</strong>. You get 3 tries per patch.
      </p>

      {finished ? (
        <section className="game-summary">
          <h3>Round over: {score} of {PATCHES_PER_ROUND * POINTS[0]} points</h3>
          <ol>
            {results.map((r, i) => (
              <li key={i}>
                {r.name} (array {r.array}): {r.found ? `found on try ${r.tries}, ${r.points} points` : "not found, 0 points"}
              </li>
            ))}
          </ol>
          <button className="active" onClick={() => setGame((g) => g + 1)}>Play again</button>
        </section>
      ) : (
        <>
          <div className="game-status">
            <span>Patch {Math.min(n + 1, PATCHES_PER_ROUND)} of {PATCHES_PER_ROUND}</span>
            <span>Score {score}</span>
          </div>

          <div className="game-board">
            {!patch && !error && <div className="game-loading">Picking a patch of sky…</div>}
            {error && (
              <div className="game-loading">
                <p>{error.message}</p>
                <button onClick={() => setGame((g) => g + 1)}>Try again</button>
              </div>
            )}
            {patch && (
              <div
                className={`game-picture ${done ? "is-done" : ""}`}
                onClick={onPick}
                role="button"
                aria-label="Patch of sky: click the star that moves"
              >
                <canvas ref={canvasRef} />
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {!done && misses >= 2 && hint && (
                    <circle className="game-hint" cx={hint.x * 100} cy={hint.y * 100} r={hint.r * 100} />
                  )}
                  {done && (
                    <>
                      {track.length > 1 && <polyline className="game-track" points={track.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} />}
                      {track.map((p, i) => <circle key={i} className="game-dot" cx={p.x * 100} cy={p.y * 100} r="0.6" />)}
                    </>
                  )}
                  {clicks.map((c, i) => (
                    <g key={i} className={c.hit ? "game-click is-hit" : "game-click"}>
                      <line x1={c.x * 100 - 2} y1={c.y * 100 - 2} x2={c.x * 100 + 2} y2={c.y * 100 + 2} />
                      <line x1={c.x * 100 - 2} y1={c.y * 100 + 2} x2={c.x * 100 + 2} y2={c.y * 100 - 2} />
                    </g>
                  ))}
                </svg>
                {done && track[frame] && (
                  <div
                    className="game-ring"
                    style={{ left: `${track[frame].x * 100}%`, top: `${track[frame].y * 100}%`, width: `${(7 / patch.crop.size) * 100}%`, height: `${(7 / patch.crop.size) * 100}%` }}
                  />
                )}
                <span className="game-date">{date}</span>
              </div>
            )}
          </div>

          {patch && (
            <div className="game-controls">
              <button onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button>
              <button onClick={() => { setPlaying(false); setFrame((f) => (f + 1) % patch.images.length); }}>Next picture</button>
              <span>Picture {frame + 1} of {patch.images.length}</span>
            </div>
          )}

          {patch && (
            <div className={`game-feedback ${found ? "is-hit" : done ? "is-miss" : ""}`} aria-live="polite">
              {!clicks.length && <p>Tip: pause and step through the pictures to compare them.</p>}
              {!done && misses > 0 && (
                <p>Not that one. {POINTS.length - misses} {POINTS.length - misses === 1 ? "try" : "tries"} left{misses >= 2 ? ": it's inside the dashed circle." : "."}</p>
              )}
              {done && (
                <>
                  <p>
                    <strong>{found ? `Found it! +${POINTS[clicks.length - 1]} points.` : "Out of tries."}</strong>{" "}
                    It's <strong>{target.name}</strong> ({target.about}). The blue ring is where {target.track.source} says it
                    was on each picture's date; the dashed line is its path.
                  </p>
                  <p className="game-why">
                    It moves {(Math.hypot(target.track.pmRa, target.track.pmDec) / 1000).toFixed(1)}″ a year, about{" "}
                    {(Math.hypot(target.track.pmRa, target.track.pmDec) / 1000 / patch.pixelArcsec).toFixed(1)} SPHEREx pixels.
                    {" "}<a href={exploreUrl}>Open it in the explorer →</a>
                  </p>
                  <button className="active" onClick={() => setN((x) => x + 1)}>
                    {n + 1 < PATCHES_PER_ROUND ? "Next patch" : "See my score"}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default SpotTheMover;

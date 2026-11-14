// Easter egg: SPACE JUNK SWEEPER — an original little arcade shooter.
// You fly a survey satellite and clear drifting space junk that blocks
// SPHEREx's view of the stars. Big junk breaks into smaller pieces.
//
// Opened by EasterEgg.js (↑ ↑ ↓ ↓ ← → ← → B A Enter). Props: onClose()
// Controls: ← → turn · ↑ thrust · Space fire · P pause · M sound on/off · Esc leave
// Sound effects are synthesised in the browser (Web Audio API), no audio files.
import { useEffect, useRef } from "react";

const TURN = 4.2;          // rad / s
const THRUST = 320;        // px / s²
const DRAG = 0.6;          // fraction of speed kept per second
const BULLET_SPEED = 620;  // px / s
const BULLET_LIFE = 0.9;   // s
const FIRE_GAP = 0.17;     // s between shots
const MAX_BULLETS = 6;
const JUNK = {             // size -> radius, points, speed
  3: { r: 48, points: 20, speed: 55 },
  2: { r: 28, points: 50, speed: 90 },
  1: { r: 15, points: 100, speed: 130 },
};
const ORANGE = "#ff8a4c";
const BEST_KEY = "space-junk-sweeper-best";
const MUTE_KEY = "space-junk-sweeper-muted";

const rand = (a, b) => a + Math.random() * (b - a);

// Sound effects, synthesised with the Web Audio API (no audio files).
// Browsers only allow sound after a key press or click; the easter-egg code
// itself counts, so sounds work as soon as the game opens.
function makeSound() {
  let ctx = null, master = null, noiseBuf = null, engine = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch { /* private mode */ }

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.35;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // a tone sliding from `from` Hz to `to` Hz
  function tone({ type = "square", from, to = from, dur, vol = 0.2, delay = 0 }) {
    const ac = audio();
    if (!ac || muted) return;
    const t = ac.currentTime + delay;
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // a burst of filtered noise (crunches and explosions)
  function noise({ dur, vol = 0.3, from = 2000, to = 150, delay = 0 }) {
    const ac = audio();
    if (!ac || muted) return;
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource(), filter = ac.createBiquadFilter(), gain = ac.createGain();
    src.buffer = noiseBuf;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const notes = (freqs, gap, dur, type = "triangle") =>
    freqs.forEach((f, i) => tone({ type, from: f, dur, vol: 0.18, delay: i * gap }));

  return {
    shoot: () => tone({ type: "square", from: 960, to: 240, dur: 0.09, vol: 0.1 }),
    hit: (size) => noise({ dur: 0.12 + size * 0.1, vol: 0.22 + size * 0.08, from: 3000 - size * 700, to: 120 }),
    boom: () => {
      noise({ dur: 1.0, vol: 0.55, from: 1400, to: 50 });
      tone({ type: "sawtooth", from: 200, to: 35, dur: 0.9, vol: 0.14 });
    },
    start: () => notes([262, 392, 523], 0.08, 0.14),
    wave: () => notes([523, 659, 784, 1047], 0.08, 0.13),
    over: () => notes([392, 330, 262, 196], 0.2, 0.28, "square"),
    // continuous engine rumble while thrusting
    thrust(on) {
      const ac = audio();
      if (!ac) return;
      if (!engine) {
        const src = ac.createBufferSource(), filter = ac.createBiquadFilter(), gain = ac.createGain();
        src.buffer = noiseBuf;
        src.loop = true;
        filter.type = "lowpass";
        filter.frequency.value = 420;
        gain.gain.value = 0;
        src.connect(filter).connect(gain).connect(master);
        src.start();
        engine = gain;
      }
      engine.gain.setTargetAtTime(on && !muted ? 0.12 : 0, ac.currentTime, 0.05);
    },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* ignore */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.35, ctx.currentTime, 0.02);
      if (engine && muted) engine.gain.value = 0;
      return muted;
    },
    isMuted: () => muted,
    close: () => { if (ctx) ctx.close(); },
  };
}

function makeJunk(size, x, y) {
  const { r, speed } = JUNK[size];
  const angle = rand(0, Math.PI * 2);
  const corners = Math.floor(rand(7, 11));
  return {
    size, x, y, r,
    vx: Math.cos(angle) * speed * rand(0.6, 1.2),
    vy: Math.sin(angle) * speed * rand(0.6, 1.2),
    rot: rand(0, Math.PI * 2),
    spin: rand(-1.2, 1.2),
    // jagged outline, plus a few "panel seams" to look like broken hardware
    shape: Array.from({ length: corners }, (_, i) => ({
      a: (i / corners) * Math.PI * 2,
      d: r * rand(0.68, 1.05),
    })),
    seams: Array.from({ length: size + 1 }, () => [rand(-0.6, 0.6), rand(-0.6, 0.6), rand(-0.6, 0.6), rand(-0.6, 0.6)]),
    hue: [265, 285, 20, 200][Math.floor(rand(0, 4))],
  };
}

function SpaceJunkSweeper({ onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let best = 0;
    try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* private mode */ }
    const sfx = makeSound();
    let engineOn = false;

    const stars = Array.from({ length: 220 }, () => ({
      x: Math.random(), y: Math.random(), s: rand(0.4, 1.8), t: rand(0, 6),
    }));

    const keys = {};
    const g = {
      mode: "title",     // title | play | paused | over
      ship: null, bullets: [], junk: [], sparks: [],
      score: 0, lives: 3, wave: 0, fireCooldown: 0, waveDelay: 0,
    };

    const newShip = () => ({ x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, safe: 2.5 });

    function startWave() {
      g.wave += 1;
      if (g.wave > 1) sfx.wave();
      const count = 3 + g.wave;
      for (let i = 0; i < count; i++) {
        // spawn at the edges, away from the ship
        const edge = Math.random() < 0.5;
        g.junk.push(makeJunk(3, edge ? rand(0, W) : (Math.random() < 0.5 ? 0 : W),
                                edge ? (Math.random() < 0.5 ? 0 : H) : rand(0, H)));
      }
    }

    function startGame() {
      Object.assign(g, { mode: "play", ship: newShip(), bullets: [], junk: [], sparks: [],
                         score: 0, lives: 3, wave: 0, fireCooldown: 0, waveDelay: 0 });
      sfx.start();
      startWave();
    }

    function burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), s = rand(40, 260);
        g.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.9), color });
      }
    }

    const wrap = (o) => {
      if (o.x < -60) o.x += W + 120; else if (o.x > W + 60) o.x -= W + 120;
      if (o.y < -60) o.y += H + 120; else if (o.y > H + 60) o.y -= H + 120;
    };

    function fire() {
      const ship = g.ship;
      if (!ship || g.fireCooldown > 0 || g.bullets.length >= MAX_BULLETS) return;
      g.bullets.push({
        x: ship.x + Math.cos(ship.a) * 14, y: ship.y + Math.sin(ship.a) * 14,
        vx: ship.vx + Math.cos(ship.a) * BULLET_SPEED, vy: ship.vy + Math.sin(ship.a) * BULLET_SPEED,
        life: BULLET_LIFE,
      });
      g.fireCooldown = FIRE_GAP;
      sfx.shoot();
    }

    function setEngine(on) {
      if (on !== engineOn) { engineOn = on; sfx.thrust(on); }
    }

    function onKeyDown(e) {
      // capture phase + stopPropagation: the page (e.g. the loupe's shortcuts)
      // doesn't see keys while the game is open
      e.stopPropagation();
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Spacebar"].includes(e.key)) e.preventDefault();
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === " " || e.key === "Spacebar") {
        if (g.mode === "title" || g.mode === "over") { startGame(); return; }
        if (g.mode === "play" && !e.repeat) fire(); // a quick tap always fires once
      }
      if ((e.key === "p" || e.key === "P") && (g.mode === "play" || g.mode === "paused")) {
        g.mode = g.mode === "play" ? "paused" : "play";
        if (g.mode === "paused") setEngine(false);
      }
      if ((e.key === "m" || e.key === "M") && !e.repeat) {
        sfx.toggleMute();
        engineOn = false; // re-sync the engine rumble on the next frame
      }
      keys[e.key] = true;
    }
    function onKeyUp(e) {
      e.stopPropagation();
      keys[e.key] = false;
    }
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);

    function update(dt) {
      for (const s of g.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
      g.sparks = g.sparks.filter((s) => s.life > 0);
      for (const j of g.junk) { j.x += j.vx * dt; j.y += j.vy * dt; j.rot += j.spin * dt; wrap(j); }
      if (g.mode !== "play") return;

      const ship = g.ship;
      if (ship) {
        if (keys.ArrowLeft) ship.a -= TURN * dt;
        if (keys.ArrowRight) ship.a += TURN * dt;
        ship.thrusting = !!keys.ArrowUp;
        setEngine(ship.thrusting);
        if (ship.thrusting) {
          ship.vx += Math.cos(ship.a) * THRUST * dt;
          ship.vy += Math.sin(ship.a) * THRUST * dt;
          if (Math.random() < 0.6) g.sparks.push({
            x: ship.x - Math.cos(ship.a) * 12, y: ship.y - Math.sin(ship.a) * 12,
            vx: -Math.cos(ship.a) * 120 + rand(-30, 30), vy: -Math.sin(ship.a) * 120 + rand(-30, 30),
            life: 0.25, color: ORANGE,
          });
        }
        const keep = Math.pow(DRAG, dt);
        ship.vx *= keep; ship.vy *= keep;
        ship.x += ship.vx * dt; ship.y += ship.vy * dt;
        wrap(ship);
        ship.safe = Math.max(0, ship.safe - dt);

        g.fireCooldown -= dt;
        if (keys[" "] || keys.Spacebar) fire(); // holding Space keeps firing
      }

      for (const b of g.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; wrap(b); }
      g.bullets = g.bullets.filter((b) => b.life > 0);

      // bullets vs junk
      const pieces = [];
      for (const j of g.junk) {
        const hit = g.bullets.find((b) => (b.x - j.x) ** 2 + (b.y - j.y) ** 2 < j.r ** 2);
        if (!hit) { pieces.push(j); continue; }
        hit.life = 0;
        g.score += JUNK[j.size].points;
        sfx.hit(j.size);
        burst(j.x, j.y, `hsl(${j.hue} 80% 70%)`, 10 + j.size * 6);
        if (j.size > 1) pieces.push(makeJunk(j.size - 1, j.x, j.y), makeJunk(j.size - 1, j.x, j.y));
      }
      g.junk = pieces;
      g.bullets = g.bullets.filter((b) => b.life > 0);

      // junk vs ship
      if (ship && ship.safe === 0 && g.junk.some((j) => (ship.x - j.x) ** 2 + (ship.y - j.y) ** 2 < (j.r * 0.8 + 10) ** 2)) {
        burst(ship.x, ship.y, ORANGE, 40);
        sfx.boom();
        setEngine(false);
        g.lives -= 1;
        if (g.lives <= 0) {
          g.mode = "over";
          g.ship = null;
          sfx.over();
          if (g.score > best) {
            best = g.score;
            try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* ignore */ }
          }
        } else {
          g.ship = newShip();
        }
      }

      if (g.junk.length === 0) {
        g.waveDelay += dt;
        if (g.waveDelay > 1.2) { g.waveDelay = 0; startWave(); }
      }
    }

    function drawShip(s, t) {
      if (s.safe > 0 && Math.floor(t * 10) % 2 === 0) return; // blink while safe
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.strokeStyle = ORANGE;
      ctx.fillStyle = "rgba(255,138,76,0.15)";
      ctx.lineWidth = 2;
      // body
      ctx.beginPath();
      ctx.moveTo(14, 0); ctx.lineTo(-8, -7); ctx.lineTo(-4, 0); ctx.lineTo(-8, 7); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // solar panels
      ctx.strokeStyle = "#7fd3ff";
      ctx.strokeRect(-6, -17, 8, 7);
      ctx.strokeRect(-6, 10, 8, 7);
      ctx.beginPath(); ctx.moveTo(-2, -10); ctx.lineTo(-2, -6); ctx.moveTo(-2, 6); ctx.lineTo(-2, 10); ctx.stroke();
      // lens
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(6, 0, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function drawJunk(j) {
      ctx.save();
      ctx.translate(j.x, j.y);
      ctx.rotate(j.rot);
      ctx.beginPath();
      j.shape.forEach((p, i) => {
        const x = Math.cos(p.a) * p.d, y = Math.sin(p.a) * p.d;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = `hsl(${j.hue} 40% 22% / 0.85)`;
      ctx.strokeStyle = `hsl(${j.hue} 80% 72%)`;
      ctx.lineWidth = 1.6;
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = `hsl(${j.hue} 70% 60% / 0.6)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [a, b, c, d] of j.seams) { ctx.moveTo(a * j.r, b * j.r); ctx.lineTo(c * j.r, d * j.r); }
      ctx.stroke();
      ctx.restore();
    }

    function text(str, x, y, size, color = "#e6eaf2", align = "center") {
      ctx.font = `700 ${size}px 'Archivo', system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
    }

    function draw(t) {
      const sky = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.75);
      sky.addColorStop(0, "#2a0b4a");
      sky.addColorStop(1, "#0a0418");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      for (const s of stars) {
        ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t * 1.5 + s.t);
        ctx.fillStyle = s.s > 1.4 ? "#ffd6a8" : "#e9d8ff";
        ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
      }
      ctx.globalAlpha = 1;

      g.junk.forEach(drawJunk);
      ctx.fillStyle = "#fff";
      for (const b of g.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2); ctx.fill(); }
      for (const s of g.sparks) {
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x, s.y, 2, 2);
      }
      ctx.globalAlpha = 1;
      if (g.ship && g.mode !== "title") drawShip(g.ship, t);

      // HUD
      if (g.mode !== "title") {
        text(`SCORE ${g.score}`, 24, 36, 20, ORANGE, "left");
        text(`WAVE ${g.wave}   LIVES ${"▲".repeat(Math.max(0, g.lives))}`, 24, 62, 15, "#c9d1e0", "left");
        text(`BEST ${Math.max(best, g.score)}`, W - 72, 36, 16, "#c9d1e0", "right"); // left of the ✕ button
      }
      text(`← → turn  ·  ↑ thrust  ·  Space fire  ·  P pause  ·  M sound ${sfx.isMuted() ? "off" : "on"}  ·  Esc leave`,
           W / 2, H - 22, 13, "#8c96ab");

      if (g.mode === "title") {
        text("SPACE JUNK SWEEPER", W / 2, H / 2 - 40, Math.min(56, W / 12), ORANGE);
        text("Clear the junk so SPHEREx can see the stars.", W / 2, H / 2 + 4, 18);
        text("Press Space to start", W / 2, H / 2 + 48, 16, "#c9d1e0");
      }
      if (g.mode === "paused") text("PAUSED  ·  P to continue", W / 2, H / 2, 26);
      if (g.mode === "over") {
        text("SIGNAL LOST", W / 2, H / 2 - 30, Math.min(52, W / 12), ORANGE);
        text(`Score ${g.score}${g.score >= best && g.score > 0 ? "  ·  new best!" : ""}`, W / 2, H / 2 + 12, 20);
        text("Space to play again  ·  Esc to leave", W / 2, H / 2 + 50, 16, "#c9d1e0");
      }
    }

    // a few pieces drift behind the title screen
    for (let i = 0; i < 5; i++) g.junk.push(makeJunk(Math.ceil(rand(0, 3)), rand(0, W), rand(0, H)));

    let raf, last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); // cap: no jumps after a tab switch
      last = now;
      if (g.mode !== "paused") update(dt);
      draw(now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      sfx.close();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [onClose]);

  return (
    <div className="junk-game" role="dialog" aria-label="Space Junk Sweeper (easter egg). Press Escape to leave.">
      <canvas ref={canvasRef} />
      <button className="junk-close" onClick={onClose} aria-label="Close the game">✕</button>
    </div>
  );
}

export default SpaceJunkSweeper;

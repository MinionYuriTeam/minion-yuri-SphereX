(function () {
  const stage = document.getElementById('stage');
  const img = document.getElementById('image');
  const vid = document.getElementById('video');
  const lens = document.getElementById('lens');
  const lctx = lens.getContext('2d');
  const lensSizeInput = document.getElementById('lensSize');
  const zoomInput = document.getElementById('zoomLevel');
  const lensBadge = document.getElementById('lensBadge');
  const zoomBadge = document.getElementById('zoomBadge');
  const zoomInBtn = document.getElementById('zoomIn');
  const zoomOutBtn = document.getElementById('zoomOut');
  const coordX = document.getElementById('coordX');
  const coordY = document.getElementById('coordY');
  const hexVal = document.getElementById('hexVal');
  const swatch = document.getElementById('swatch');
  const dimVal = document.getElementById('dimVal');
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const closeModal = document.getElementById('closeModal');
  const mediaInput = document.getElementById('fileInput');
  // ---- Motion View ----
  const motionBtn = document.getElementById('motionBtn');
  const motionSens = document.getElementById('motionSens');
  const motionBadge = document.getElementById('motionBadge');
  const motionView = document.getElementById('motionView');

  let lensSize = 180;
  let zoom = 2.5;
  let pinned = false;
  let lastPoint = null;
  let mode = 'image';     // 'image' | 'video'
  let rafId = null;       // keeps the lens / motion view live during playback

  const frameCanvas = document.createElement('canvas');
  const fctx = frameCanvas.getContext('2d', { willReadFrequently: true });
  let samplerReady = false;

  // ---- Motion View analysis buffers ----
  const ACAP = 512;                       // analysis resolution (downscaled)
  const analCanvas = document.createElement('canvas');
  const actx = analCanvas.getContext('2d', { willReadFrequently: true });
  const visCanvas = document.createElement('canvas');   // small visualization
  const vctx = visCanvas.getContext('2d');
  const mctx = motionView.getContext('2d');             // upscaled output
  let aw = 0, ah = 0;
  let prevFrame = null;                   // previous downscaled frame (raw RGBA)
  let grayCur = null;                     // current frame luminance (Float32)
  let grayPrev = null;                    // PREVIOUS frame luminance (Float32)
  let prevDil = null;                     // 3x3 max-dilation of grayPrev
  let motionBuf = null;                   // per-pixel persistence score
  let motionOn = false;
  let motionSensitivity = 100;

  // Motion tuning constants:
  //  MOVE_LEVEL  score needed to render a pixel as "moving".
  //              1.0 = INSTANT: one qualifying frame lights it up.
  //  HIT_GAIN    score a qualifying frame contributes.
  //  WEAK_FRAC   a diff above threshold*WEAK_FRAC (but below threshold)
  //              counts as SUBTLE change and gets WEAK_GAIN — lets sustained
  //              low-amplitude motion (skin, hair, slow drift) accumulate
  //              and stay lit instead of being decayed away.
  //  DECAY       score lost per non-qualifying frame.
  //  SPILL       score given to the 4 neighbours of a hit. MUST be >=
  //              MOVE_LEVEL so spilled pixels actually render lit — the
  //              earlier value 0.9 < 1.0 made the "fill" invisible and
  //              left dead holes inside moving objects.
  //  CHROMA_W    weight of the color-change term relative to luminance.
  const MOVE_LEVEL = 1.0;
  const HIT_GAIN = 1.0;
  const WEAK_FRAC = 0.45;
  const WEAK_GAIN = 0.5;
  const DECAY = 0.4;
  const SPILL = 0;
  const CHROMA_W = 0.5;

  function activeMedia() { return mode === 'video' ? vid : img; }
  // What is actually shown in the stage (Motion View replaces the video element)
  function displayMedia() {
    return (mode === 'video' && motionOn) ? motionView : activeMedia();
  }
  function natW() { return mode === 'video' ? vid.videoWidth : img.naturalWidth; }
  function natH() { return mode === 'video' ? vid.videoHeight : img.naturalHeight; }

  function prepareSampler() {
    const w = natW(), h = natH();
    if (!w || !h) { samplerReady = false; return; }
    frameCanvas.width = w;
    frameCanvas.height = h;
    try {
      fctx.drawImage(activeMedia(), 0, 0);
      samplerReady = true;
    } catch (err) {
      samplerReady = false; // tainted source (no CORS) — coords still work
    }
    dimVal.textContent = w + ' × ' + h;
    coordX.max = w - 1;
    coordY.max = h - 1;
  }

  function sampleAt(nx, ny) {
    if (!samplerReady) return null;
    try {
      const d = fctx.getImageData(Math.round(nx), Math.round(ny), 1, 1).data;
      return '#' + [d[0], d[1], d[2]]
        .map(v => v.toString(16).padStart(2, '0')).join('');
    } catch (err) {
      return null;
    }
  }

  // Samples a lensSize/zoom-wide region of the CURRENT frame, centered on
  // the point, drawn scaled up inside a circular clip. In Motion View the
  // lens shows the motion visualization, at identical coordinates.
  function drawLens(nx, ny) {
    const half = lensSize / 2;
    const sw = lensSize / zoom;
    const sh = sw;
    const sx = nx - sw / 2;
    const sy = ny - sh / 2;

    lctx.save();
    lctx.clearRect(0, 0, lensSize, lensSize);
    lctx.beginPath();
    lctx.arc(half, half, half - 2, 0, Math.PI * 2);
    lctx.clip();
    try {
      const src = (mode === 'video' && motionOn) ? motionView : activeMedia();
      lctx.drawImage(src, sx, sy, sw, sh, 0, 0, lensSize, lensSize);
    } catch (err) { /* tainted source */ }
    lctx.restore();
  }

  // ================= Motion View =================
  function setupAnalysis() {
    const w = vid.videoWidth, h = vid.videoHeight;
    if (!w || !h) return;
    const scale = Math.min(1, ACAP / w);
    aw = Math.max(2, Math.round(w * scale));
    ah = Math.max(2, Math.round(h * scale));
    analCanvas.width = aw;
    analCanvas.height = ah;
    visCanvas.width = aw;
    visCanvas.height = ah;
    motionView.width = w;   // output at native resolution
    motionView.height = h;
    prevFrame = null;
    prevDil = new Float32Array(aw * ah);
    grayCur = new Float32Array(aw * ah);
    grayPrev = new Float32Array(aw * ah);
    motionBuf = new Float32Array(aw * ah);
  }

  // Max-dilate `src` into `dst`: each cell becomes the brightest value in
  // its 3x3 neighborhood. We dilate the PREVIOUS frame's luminance, so the
  // comparison "current pixel vs brightest previous value nearby" is a true
  // TEMPORAL diff — a background that flashes uniformly changes everywhere,
  // not just at edges.
  function dilate(src, dst) {
    const W = aw, H = ah;
    if (!dst) return;
    for (let y = 0; y < H; y++) {
      const y0 = y > 0 ? y - 1 : 0;
      const y1 = y < H - 1 ? y + 1 : H - 1;
      for (let x = 0; x < W; x++) {
        const x0 = x > 0 ? x - 1 : 0;
        const x1 = x < W - 1 ? x + 1 : W - 1;
        const o = y * W + x;
        let g = 0;
        for (let yy = y0; yy <= y1; yy++) {
          const row = yy * W;
          for (let xx = x0; xx <= x1; xx++) {
            const q = row + xx;
            if (src[q] > g) g = src[q];
          }
        }
        dst[o] = g;
      }
    }
  }

  // Exponential sensitivity mapping — visible changes even at 1%-2% steps.
  // NOTE: the luminance diff ranges 0..255, so thresholds are ~23.3 at 0%
  // .. ~1.7 at 100%. The chroma term is halved (CHROMA_W), so it stays
  // below the luminance range too.
  function currentThreshold() {
    return 23.3 * Math.pow(1.7 / 23.3, motionSensitivity / 100);
  }

  // Detects a DUPLICATE frame: rAF typically fires at 60–144Hz while the
  // video is 24–30fps, so ~half the analysis ticks re-sample the SAME
  // video frame. A duplicated frame yields zero diff everywhere, and
  // letting the decay run on it erodes the highlights into flickering
  // dead patches. If the frame is identical to the previous one we FREEZE
  // the motion buffer instead of updating it. Compares a strided sample
  // of the two luminance buffers — identical frames are exactly equal.
  function isDuplicateFrame(N) {
    for (let i = 0; i < N; i += 3) {
      if (Math.abs(grayCur[i] - grayPrev[i]) > 0.5) return false;
    }
    return true;
  }

  function analyzeMotion() {
    if (!aw || vid.readyState < 2) return;
    actx.drawImage(vid, 0, 0, aw, ah);
    let cur;
    try {
      cur = actx.getImageData(0, 0, aw, ah);
    } catch (err) { return; }  // tainted source
    const cd = cur.data;
    const N = aw * ah;

    // Luminance (BT.601) for every pixel
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      grayCur[i] = 0.299 * cd[p] + 0.587 * cd[p + 1] + 0.114 * cd[p + 2];
    }

    // Advance the "previous" bookkeeping regardless of what we do below
    function commit() {
      prevFrame = cd;
      const tmp = grayPrev;
      grayPrev = grayCur;
      grayCur = tmp;
    }

    if (prevFrame && motionBuf) {
      // Duplicate frame → freeze: don't decay, don't add, just keep the
      // current visualization and wait for the next real frame.
      if (isDuplicateFrame(N)) { commit(); return; }

      // dilate the PREVIOUS frame's luminance (true temporal comparison)
      dilate(grayPrev, prevDil);
      const buf = motionBuf;
      const W = aw, H = ah;
      const gc = grayCur;
      const gp = grayPrev;  // raw previous luminance (for the weak tier)
      const pd = prevDil;   // dilated PREVIOUS luminance
      const pf = prevFrame; // raw previous frame (for the chroma term)
      const thr = currentThreshold();
      const CW = CHROMA_W;
      const weakThr = thr * WEAK_FRAC;
      for (let y = 0, i = 0, p = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++, p += 4) {
          // --- luminance change (primary signal, perceptually weighted) ---
          const dl = Math.abs(gc[i] - pd[i]);

          // --- chroma change (catches hue shifts at constant brightness) ---
          const dcR = cd[p] - pf[p];
          const dcG = cd[p + 1] - pf[p + 1];
          const dcB = cd[p + 2] - pf[p + 2];
          const dcMax = Math.max(Math.abs(dcR - dcG),
                                 Math.abs(dcG - dcB),
                                 Math.abs(dcR - dcB));
          const d = Math.max(dl, dcMax * CW);

          if (d > thr) {
            // strong change: instant capture
            buf[i] = Math.min(buf[i] + HIT_GAIN, 3);
            // neighbor spill: fill in the body of the moving object.
            // SPILL >= MOVE_LEVEL so these render LIT.
            if (x > 0 && buf[i - 1] < SPILL) buf[i - 1] = SPILL;
            if (x < W - 1 && buf[i + 1] < SPILL) buf[i + 1] = SPILL;
            if (y > 0 && buf[i - W] < SPILL) buf[i - W] = SPILL;
            if (y < H - 1 && buf[i + W] < SPILL) buf[i + W] = SPILL;
          } else if (d > weakThr) {
            // subtle but real change (skin texture, hair, slow drift):
            // accumulate half-gain so sustained motion stays lit instead
            // of being decayed to a dead hole.
            buf[i] = Math.min(buf[i] + WEAK_GAIN, 3);
          } else {
            buf[i] = Math.max(buf[i] - DECAY, 0);
          }
        }
      }
    }
    commit();
  }

  function renderMotionView() {
    if (!prevFrame || !motionBuf) return;
    const pf = prevFrame;
    const out = vctx.createImageData(aw, ah);
    const od = out.data;
    for (let i = 0, p = 0; i < motionBuf.length; i++, p += 4) {
      if (motionBuf[i] >= MOVE_LEVEL) {
        // moving pixel: full brightness of the original
        od[p] = pf[p];
        od[p + 1] = pf[p + 1];
        od[p + 2] = pf[p + 2];
      } else {
        // static pixel: darkened so the moving ones stand out
        od[p] = pf[p] * 0.18;
        od[p + 1] = pf[p + 1] * 0.18;
        od[p + 2] = pf[p + 2] * 0.18;
      }
      od[p + 3] = 255;
    }
    vctx.putImageData(out, 0, 0);
    mctx.imageSmoothingEnabled = true;
    mctx.clearRect(0, 0, motionView.width, motionView.height);
    mctx.drawImage(visCanvas, 0, 0, motionView.width, motionView.height);
  }

  // While a video is playing, keep both the motion view and the lens live
  // every animation frame — even when the mouse is not moving. The try/catch
  // guarantees an unexpected error can never terminate the rAF loop.
  function startVideoLoop() {
    if (rafId !== null) return;
    function tick() {
      try {
        if (mode !== 'video') { rafId = null; return; }
        if (motionOn) {
          analyzeMotion();
          renderMotionView();
        }
        if (lens.classList.contains('visible')) render();
      } catch (err) { /* keep the loop alive no matter what */ }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }
  function stopVideoLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  vid.addEventListener('loadeddata', function () {
    setupAnalysis();
    prepareSampler();
    motionBtn.disabled = false;
    startVideoLoop();
  });
  img.addEventListener('load', function () {
    prepareSampler();
    lastPoint = null;
  });
  if (img.complete && img.naturalWidth > 0) prepareSampler();

  function render() {
    const w = natW(), h = natH();
    if (!lastPoint || !w) return;

    const rect = displayMedia().getBoundingClientRect();
    const half = lensSize / 2;

    const nx = Math.max(0, Math.min(lastPoint.x, w - 1));
    const ny = Math.max(0, Math.min(lastPoint.y, h - 1));
    lastPoint = { x: nx, y: ny };

    drawLens(nx, ny);

    const dx = nx / w * rect.width;
    const dy = ny / h * rect.height;
    lens.style.left = (dx - half) + 'px';
    lens.style.top = (dy - half) + 'px';

    if (document.activeElement !== coordX) coordX.value = Math.round(nx);
    if (document.activeElement !== coordY) coordY.value = Math.round(ny);

    // The color readout always samples the ORIGINAL frame, never the
    // motion visualization, so values stay meaningful in both views.
    if (mode === 'video') {
      try { fctx.drawImage(vid, 0, 0); } catch (err) { /* tainted */ }
    }

    const hex = sampleAt(nx, ny);
    if (hex) {
      hexVal.textContent = hex.toUpperCase();
      swatch.style.background = hex;
    } else {
      hexVal.textContent = 'n/a';
      swatch.style.background = 'transparent';
    }

    lensBadge.textContent = lensSize + ' px';
    zoomBadge.textContent = zoom.toFixed(1) + '×';
  }

  function showLens() {
    lens.classList.add('visible');
    lens.style.width = lensSize + 'px';
    lens.style.height = lensSize + 'px';
    lens.width = lensSize;
    lens.height = lensSize;
  }

  function trackPoint(clientX, clientY) {
    const rect = displayMedia().getBoundingClientRect();
    lastPoint = {
      x: (clientX - rect.left) / rect.width * natW(),
      y: (clientY - rect.top) / rect.height * natH()
    };
    showLens();
    render();
  }

  stage.addEventListener('mousemove', function (event) {
    if (pinned) return;
    trackPoint(event.clientX, event.clientY);
  });
  stage.addEventListener('mouseleave', function () {
    if (!pinned) lens.classList.remove('visible');
  });
  stage.addEventListener('dblclick', togglePin);
  stage.addEventListener('wheel', function (event) {
    event.preventDefault();
    setZoom(zoom * (event.deltaY < 0 ? 1.1 : 0.9));
  }, { passive: false });
  stage.addEventListener('touchmove', function (event) {
    event.preventDefault();
    const t = event.touches[0];
    trackPoint(t.clientX, t.clientY);
  }, { passive: false });
  stage.addEventListener('touchend', function () {
    if (!pinned) lens.classList.remove('visible');
  });

  function togglePin() {
    pinned = !pinned;
    lens.classList.toggle('locked', pinned);
    if (pinned) showLens();
  }

  function jumpToManual() {
    const x = parseFloat(coordX.value);
    const y = parseFloat(coordY.value);
    if (isNaN(x) || isNaN(y)) return;
    lastPoint = { x: x, y: y };
    pinned = true;
    showLens();
    lens.classList.add('locked');
    render();
  }
  coordX.addEventListener('change', jumpToManual);
  coordY.addEventListener('change', jumpToManual);
  [coordX, coordY].forEach(el => el.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') jumpToManual();
  }));

  function setZoom(newZoom) {
    zoom = Math.max(1.5, Math.min(10, newZoom));
    zoomInput.value = zoom;
    render();
  }
  function setLensSize(newSize) {
    lensSize = Math.max(80, Math.min(320, newSize));
    lensSizeInput.value = lensSize;
    showLens();
    render();
  }
  zoomInBtn.addEventListener('click', function () { setZoom(zoom + 0.5); });
  zoomOutBtn.addEventListener('click', function () { setZoom(zoom - 0.5); });
  lensSizeInput.addEventListener('input', function () {
    setLensSize(parseInt(this.value, 10));
  });
  zoomInput.addEventListener('input', function () {
    zoom = parseFloat(this.value);
    render();
  });

  // ---------- Motion View controls ----------
  function setMotionView(on) {
    motionOn = on && mode === 'video';
    motionBtn.setAttribute('aria-pressed', String(motionOn));
    motionBtn.classList.toggle('active', motionOn);
    motionView.style.display = motionOn ? 'block' : 'none';
    vid.style.display = motionOn ? 'none' : 'block';
    if (motionOn) {
      // reset analysis so it starts from the current frame
      prevFrame = null;
      motionBuf && motionBuf.fill(0);
    }
  }
  motionBtn.addEventListener('click', function () {
    if (mode !== 'video' || !vid.videoWidth) return;
    setMotionView(!motionOn);
  });
  motionSens.addEventListener('input', function () {
    motionSensitivity = parseFloat(this.value);
    motionBadge.textContent = motionSensitivity + '%';
  });

  // ---------- Unified Browse: images AND videos ----------
  mediaInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    samplerReady = false;
    lastPoint = null;
    pinned = false;
    lens.classList.remove('locked');
    // Motion View resets whenever new media loads; default is original view
    setMotionView(false);
    motionBtn.disabled = true;

    if (file.type.startsWith('video/')) {
      mode = 'video';
      img.style.display = 'none';
      vid.style.display = 'block';
      vid.src = URL.createObjectURL(file);
      vid.play().catch(function () {});
      // button is enabled once 'loadeddata' fires
    } else {
      mode = 'image';
      stopVideoLoop();
      vid.pause();
      vid.removeAttribute('src');
      vid.style.display = 'none';
      img.style.display = 'block';
      img.src = URL.createObjectURL(file);
    }
  });

  // ================= Template Matching (translated from the bot's
  // recognize_handler.template_match / OpenCV matchTemplate) =================
  // Grayscale helper — BT.601, matching the luminance used in Motion View.
  function toGray(ctx, w, h) {
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0, p = 0; i < g.length; i++, p += 4)
      g[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    return g;
  }

  // Wraps any drawable (img, video, canvas) into a canvas + ctx pair the
  // matcher can read pixels from. Marked so repeat calls reuse the copy.
  function asSource(drawable) {
    if (drawable instanceof HTMLCanvasElement && drawable.__tplCtx) {
      return drawable; // already prepared (from a previous call)
    }
    const c = document.createElement('canvas');
    c.width = drawable.naturalWidth || drawable.videoWidth || drawable.width;
    c.height = drawable.naturalHeight || drawable.videoHeight || drawable.height;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(drawable, 0, 0);
    c.__tplCtx = cx;
    return c;
  }

  // Exhaustive scan with early abandonment. `threshold` is the MEAN
  // per-pixel grayscale difference on the 0..255 scale: 8 ≈ strict UI
  // match, 15–25 ≈ fuzzy match. `region` is the optional search window
  // [x0, y0, x1, y1] — the analog of the bot's mask=[...] argument, and
  // the single biggest speed lever.
  function matchTemplate(frame, tpl, opts = {}) {
    const { threshold = 8, stride = 1, maxHits = Infinity, region = null } = opts;
    const fw = frame.width, fh = frame.height;
    const fg = toGray(frame.__tplCtx, fw, fh);
    const tg = toGray(tpl.__tplCtx, tpl.width, tpl.height);
    const tw = tpl.width, th = tpl.height;
    const tArea = tw * th;
    const worst = threshold * tArea;   // max total diff a hit may accumulate

    const x0 = region ? Math.max(0, region[0]) : 0;
    const y0 = region ? Math.max(0, region[1]) : 0;
    const x1 = region ? Math.min(region[2], fw) : fw;
    const y1 = region ? Math.min(region[3], fh) : fh;

    const hits = [];
    for (let y = y0; y + th <= y1; y += stride) {
      for (let x = x0; x + tw <= x1; x += stride) {
        let sum = 0;
        let dead = false;
        for (let ty = 0; ty < th && !dead; ty++) {
          const fRow = (y + ty) * fw + x;
          const tRow = ty * tw;
          for (let tx = 0; tx < tw; tx++) {
            sum += Math.abs(fg[fRow + tx] - tg[tRow + tx]);
            if (sum > worst) { dead = true; break; }   // ← early abandonment
          }
        }
        if (!dead) {
          hits.push({ x, y, score: sum / tArea });
          if (hits.length >= maxHits) return hits;
        }
      }
    }
    return hits;
  }

  // Peak suppression: OpenCV merges overlapping detections; without this a
  // big matched button yields dozens of adjacent hits a few px apart.
  function dedupeHits(hits, tw, th) {
    const minDist = Math.min(tw, th) / 2;
    const sorted = hits.slice().sort((a, b) => a.score - b.score);
    const kept = [];
    for (const h of sorted) {
      if (kept.every(k =>
        Math.hypot(k.x - h.x, k.y - h.y) >= minDist)) kept.push(h);
    }
    return kept;
  }

  // Pyramid version: 4x-downscaled coarse scan (256x fewer comparisons),
  // then refine each candidate at full resolution in a small neighborhood.
  function matchTemplateFast(frameDrawable, tplDrawable, opts = {}) {
    const S = 4;
    const frame = asSource(frameDrawable);
    const tpl = asSource(tplDrawable);

    const mkSmall = (src) => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.floor(src.width / S));
      c.height = Math.max(1, Math.floor(src.height / S));
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.imageSmoothingEnabled = true;
      cx.drawImage(src, 0, 0, c.width, c.height);
      c.__tplCtx = cx;
      return c;
    };
    const fs = mkSmall(frame);
    const ts = mkSmall(tpl);

    const coarse = matchTemplate(fs, ts, {
      threshold: opts.threshold ?? 8,
      maxHits: 5,
      region: opts.region ? opts.region.map(v => v / S) : null,
    });

    const refined = [];
    for (const c of coarse) {
      const rx = Math.max(0, c.x * S - S);
      const ry = Math.max(0, c.y * S - S);
      const best = matchTemplate(frame, tpl, {
        threshold: opts.threshold ?? 8,
        maxHits: 1,
        region: [rx, ry, rx + tpl.width + 2 * S, ry + tpl.height + 2 * S],
      })[0];
      if (best) refined.push(best);
    }
    return dedupeHits(refined, tpl.width, tpl.height);
  }

  // Refreshes the shared frame buffer from the currently loaded media and
  // returns it — this is what lets the matcher search the LIVE video frame.
  function currentFrame() {
    const w = natW(), h = natH();
    if (!w || !h) return null;
    frameCanvas.width = w;
    frameCanvas.height = h;
    try {
      fctx.drawImage(activeMedia(), 0, 0);
    } catch (err) { return null; }  // tainted source
    frameCanvas.__tplCtx = fctx;
    return frameCanvas;
  }

  // Public API — call from the console or another script:
  //   findTemplate(tplImg)                       → exhaustive scan, whole frame
  //   findTemplate(tplImg, {region:[100,90,1380,210]})
  //   findTemplate(tplImg, {threshold:15, dedupe:true})
  //   findTemplateFast(tplImg)                   → pyramid scan, big frames
  // Returns [{x, y, score}] in frame coordinates.
  window.findTemplate = function (tplDrawable, opts = {}) {
    const frame = currentFrame();
    if (!frame) return [];
    const tpl = asSource(tplDrawable);
    const hits = matchTemplate(frame, tpl, opts);
    return opts.dedupe ? dedupeHits(hits, tpl.width, tpl.height) : hits;
  };
  window.findTemplateFast = function (tplDrawable, opts = {}) {
    const frame = currentFrame();
    if (!frame) return [];
    return matchTemplateFast(frame, tplDrawable, opts);
  };

  // ---------- Keyboard ----------
  window.addEventListener('keydown', function (event) {
    if (event.target.tagName === 'INPUT') return;
    if (event.target.tagName === 'BUTTON' && event.key === ' ') return;

    if (event.key === 'Escape' && helpModal.classList.contains('open')) {
      helpModal.classList.remove('open');
      return;
    }
    switch (event.key) {
      case '+': case '=': setZoom(zoom + 0.5); break;
      case '-': case '_': setZoom(zoom - 0.5); break;
      case '[': setLensSize(lensSize - 20); break;
      case ']': setLensSize(lensSize + 20); break;
      case 'p': case 'P': togglePin(); break;
      case 'm': case 'M':
        if (mode === 'video') setMotionView(!motionOn);
        break;
    }
  });

  // ---------- Help modal ----------
  helpBtn.addEventListener('click', function () { helpModal.classList.add('open'); });
  closeModal.addEventListener('click', function () { helpModal.classList.remove('open'); });
  helpModal.addEventListener('click', function (event) {
    if (event.target === helpModal) helpModal.classList.remove('open');
  });
})();
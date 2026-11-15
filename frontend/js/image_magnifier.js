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
  let rafId = null;

  const frameCanvas = document.createElement('canvas');
  const fctx = frameCanvas.getContext('2d', { willReadFrequently: true });
  let samplerReady = false;

  // ---- Motion View analysis buffers ----
  const ACAP = 512;                       // VIDEO analysis resolution
  const IMG_CAP = 2048;                   // IMAGE analysis resolution (one-shot)
  const analCanvas = document.createElement('canvas');
  const actx = analCanvas.getContext('2d', { willReadFrequently: true });
  const bgSmall = document.createElement('canvas');
  const bsctx = bgSmall.getContext('2d', { willReadFrequently: true });
  const bgBig = document.createElement('canvas');
  const bbctx = bgBig.getContext('2d', { willReadFrequently: true });
  const visCanvas = document.createElement('canvas');
  const vctx = visCanvas.getContext('2d');
  const mctx = motionView.getContext('2d');
  let aw = 0, ah = 0;
  let prevFrame = null;
  let grayCur = null;
  let grayPrev = null;
  let prevDil = null;
  let motionBuf = null;
  let motionOn = false;
  let motionSensitivity = 100;

  // ---- ============================================================
  // ---- ANALYSIS CACHE — designed to NEVER touch the playback path
  // ---- ============================================================
  // PERFORMANCE RULE learned from profiling: the hot loop must not
  // allocate. The old (fast) version had zero allocations per frame; the
  // slow regressions came from per-frame cloneCanvas + Float32Array.copy
  // + queued toBlob PNG encodes firing in bursts.
  //
  //  * VIDEO buckets: RAM-only, and each snapshot is drawn into ONE OF TWO
  //    ROTATING, pre-allocated canvases (snapPool) — no canvas creation,
  //    no buffer allocation beyond one small Float32Array copy per bucket
  //    change (~5/sec). Snapshots happen at most every 0.2s, never per
  //    frame. Eviction drops refs only — free.
  //  * IMAGE analyses: computed once, cached in RAM + persisted to
  //    IndexedDB ('motion-view-cache'). One-shot work is inherently off
  //    the playback path, so PNG encoding there is harmless.
  //  * Nothing in the cache layer runs while a video frame is being
  //    processed except the rotation draw described above.
  const CACHE_MAX = 40;
  const VID_CACHE_MAX = 24;
  const IDB_NAME = 'motion-view-cache';
  const IDB_STORE = 'analysis';
  const analysisCache = new Map();   // image entries: { vis, aw, ah }
  const vidCache = new Map();        // video entries: { snap, buf, aw, ah }

  // Two reusable snapshot canvases, alternated so no allocation per snapshot
  const snapPool = [document.createElement('canvas'),
                    document.createElement('canvas')];
  let snapIdx = 0;

  const idb = (() => {
    let dbp = null;
    function open() {
      if (!('indexedDB' in window)) return Promise.resolve(null);
      if (!dbp) {
        dbp = new Promise((resolve) => {
          const req = indexedDB.open(IDB_NAME, 1);
          req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);   // private mode → RAM-only
        }).catch(() => null);
      }
      return dbp;
    }
    return {
      get(key) {
        return open().then((db) => {
          if (!db) return null;
          return new Promise((res) => {
            const t = db.transaction(IDB_STORE, 'readonly')
              .objectStore(IDB_STORE).get(key);
            t.onsuccess = () => res(t.result || null);
            t.onerror = () => res(null);
          });
        });
      },
      put(key, val) {
        return open().then((db) => {
          if (!db) return;
          return new Promise((res) => {
            const t = db.transaction(IDB_STORE, 'readwrite')
              .objectStore(IDB_STORE).put(val, key);
            t.onsuccess = () => res(true);
            t.onerror = () => res(false);
          });
        });
      },
    };
  })();

  function cacheGet(key) {
    const v = analysisCache.get(key) || vidCache.get(key);
    if (v) {
      const src = analysisCache.has(key) ? analysisCache : vidCache;
      src.delete(key); src.set(key, v);   // refresh LRU order
    }
    return v;
  }
  function cachePutImage(key, val) {
    if (analysisCache.has(key)) analysisCache.delete(key);
    analysisCache.set(key, val);
    while (analysisCache.size + vidCache.size > CACHE_MAX) {
      // evict video entries first — image analyses are precious (slow to
      // compute); video snapshots regenerate passively during playback.
      let evicted = false;
      for (const k of vidCache.keys()) { vidCache.delete(k); evicted = true; break; }
      if (!evicted) analysisCache.delete(analysisCache.keys().next().value);
    }
  }
  function cachePutVideo(key, snap, buf, aw_, ah_) {
    if (vidCache.has(key)) vidCache.delete(key);
    vidCache.set(key, { snap, buf, aw: aw_, ah: ah_ });
    while (vidCache.size > VID_CACHE_MAX) {
      vidCache.delete(vidCache.keys().next().value);
    }
  }
  function cloneCanvas(c) {
    const n = document.createElement('canvas');
    n.width = c.width; n.height = c.height;
    n.getContext('2d').drawImage(c, 0, 0);
    return n;
  }
  function persistImage(key, entry) {
    entry.vis.toBlob((blob) => {
      if (!blob) return;
      idb.put(key, { aw: entry.aw, ah: entry.ah, visBlob: blob });
    }, 'image/png');
  }
  window.addEventListener('pagehide', function () {
    // flush any freshly computed (not yet persisted) image entries
    for (const [key, entry] of analysisCache) {
      if (!entry.persisted) { entry.persisted = true; persistImage(key, entry); }
    }
  });
  function restoreVis(rec) {
    if (!rec || !rec.visBlob) return Promise.resolve(false);
    return createImageBitmap(rec.visBlob)
      .then((bmp) => {
        vctx.clearRect(0, 0, aw, ah);
        vctx.drawImage(bmp, 0, 0);
        bmp.close && bmp.close();
        upscaleToMotionView();
        return true;
      })
      .catch(() => false);
  }

  function computeMediaKey(file) {
    if (file) return file.name + ':' + file.size;
    return (mode === 'video' ? vid.currentSrc : img.currentSrc) || 'unknown';
  }
  let mediaKey = 'unknown';
  function sensBucket() { return Math.round(motionSensitivity / 5) * 5; }
  function videoBucketKey(t) {
    const tb = (Math.floor(t * 5) / 5).toFixed(2);
    return 'vid|' + mediaKey + '|' + tb + '|' + sensBucket();
  }

  // Motion tuning constants (VIDEO mode):
  const MOVE_LEVEL = 1.0;
  const HIT_GAIN = 1.0;
  const WEAK_FRAC = 0.45;
  const WEAK_GAIN = 0.5;
  const DECAY = 0.4;
  const SPILL = 0;
  const CHROMA_W = 0.5;

  // IMAGE mode tuning
  const IMG_THR_LO = 25;
  const IMG_THR_HI = 170;
  const BG_DIVISOR = 24;

  function activeMedia() { return mode === 'video' ? vid : img; }
  function displayMedia() { return motionOn ? motionView : activeMedia(); }
  function natW() { return mode === 'video' ? vid.videoWidth : img.naturalWidth; }
  function natH() { return mode === 'video' ? vid.videoHeight : img.naturalHeight; }

  // EXACTLY ONE element visible at a time — single source of truth.
  function updateStageVisibility() {
    img.style.display = (!motionOn && mode === 'image') ? 'block' : 'none';
    vid.style.display = (!motionOn && mode === 'video') ? 'block' : 'none';
    motionView.style.display = motionOn ? 'block' : 'none';
  }

  function prepareSampler() {
    const w = natW(), h = natH();
    if (!w || !h) { samplerReady = false; return; }
    frameCanvas.width = w;
    frameCanvas.height = h;
    try {
      fctx.drawImage(activeMedia(), 0, 0);
      samplerReady = true;
    } catch (err) {
      samplerReady = false;
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
      const src = motionOn ? motionView : activeMedia();
      lctx.drawImage(src, sx, sy, sw, sh, 0, 0, lensSize, lensSize);
    } catch (err) { /* tainted source */ }
    lctx.restore();
  }

  // ================= Motion View — VIDEO mode =================
  function setupVideoAnalysis() {
    const w = vid.videoWidth, h = vid.videoHeight;
    if (!w || !h) return;
    const scale = Math.min(1, ACAP / w);
    aw = Math.max(2, Math.round(w * scale));
    ah = Math.max(2, Math.round(h * scale));
    analCanvas.width = aw;
    analCanvas.height = ah;
    visCanvas.width = aw;
    visCanvas.height = ah;
    snapPool.forEach(s => { s.width = aw; s.height = ah; });
    motionView.width = w;
    motionView.height = h;
    prevFrame = null;
    prevDil = new Float32Array(aw * ah);
    grayCur = new Float32Array(aw * ah);
    grayPrev = new Float32Array(aw * ah);
    motionBuf = new Float32Array(aw * ah);
  }

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

  function currentThreshold() {
    return 23.3 * Math.pow(1.7 / 23.3, motionSensitivity / 100);
  }

  // Duplicate-frame freeze (cheap strided check): at rAF cadence ~half the
  // ticks sample the same video frame; freezing instead of decaying keeps
  // highlights steady. This runs on the OLD fast path, analysis-only.
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
    } catch (err) { return; }
    const cd = cur.data;
    const N = aw * ah;

    for (let i = 0, p = 0; i < N; i++, p += 4) {
      grayCur[i] = 0.299 * cd[p] + 0.587 * cd[p + 1] + 0.114 * cd[p + 2];
    }

    function commit() {
      prevFrame = cd;
      const tmp = grayPrev;
      grayPrev = grayCur;
      grayCur = tmp;
    }

    if (prevFrame && motionBuf) {
      if (isDuplicateFrame(N)) { commit(); return; }   // freeze, don't decay
      dilate(grayPrev, prevDil);
      const buf = motionBuf;
      const W = aw, H = ah;
      const gc = grayCur;
      const pd = prevDil;
      const pf = prevFrame;
      const thr = currentThreshold();
      const CW = CHROMA_W;
      const weakThr = thr * WEAK_FRAC;
      for (let y = 0, i = 0, p = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++, p += 4) {
          const dl = Math.abs(gc[i] - pd[i]);
          const dcR = cd[p] - pf[p];
          const dcG = cd[p + 1] - pf[p + 1];
          const dcB = cd[p + 2] - pf[p + 2];
          const dcMax = Math.max(Math.abs(dcR - dcG),
                                 Math.abs(dcG - dcB),
                                 Math.abs(dcR - dcB));
          const d = Math.max(dl, dcMax * CW);

          if (d > thr) {
            buf[i] = Math.min(buf[i] + HIT_GAIN, 3);
            if (SPILL > 0) {
              if (x > 0 && buf[i - 1] < SPILL) buf[i - 1] = SPILL;
              if (x < W - 1 && buf[i + 1] < SPILL) buf[i + 1] = SPILL;
              if (y > 0 && buf[i - W] < SPILL) buf[i - W] = SPILL;
              if (y < H - 1 && buf[i + W] < SPILL) buf[i + W] = SPILL;
            }
          } else if (d > weakThr) {
            buf[i] = Math.min(buf[i] + WEAK_GAIN, 3);
          } else {
            buf[i] = Math.max(buf[i] - DECAY, 0);
          }
        }
      }
    }
    commit();
  }

  function paintVis(sourceData, buf) {
    const od = vctx.createImageData(aw, ah).data;
    const sd = sourceData;
    for (let i = 0, p = 0; i < buf.length; i++, p += 4) {
      if (buf[i] >= MOVE_LEVEL) {
        od[p] = sd[p]; od[p + 1] = sd[p + 1]; od[p + 2] = sd[p + 2];
      } else {
        od[p] = sd[p] * 0.18; od[p + 1] = sd[p + 1] * 0.18; od[p + 2] = sd[p + 2] * 0.18;
      }
      od[p + 3] = 255;
    }
    vctx.putImageData(new ImageData(od, aw, ah), 0, 0);
  }

  function upscaleToMotionView() {
    mctx.imageSmoothingEnabled = true;
    mctx.clearRect(0, 0, motionView.width, motionView.height);
    mctx.drawImage(visCanvas, 0, 0, motionView.width, motionView.height);
  }

  function renderMotionView() {
    if (!prevFrame || !motionBuf) return;
    paintVis(prevFrame, motionBuf);
    upscaleToMotionView();
  }

  // ================= Motion View — IMAGE mode =================
  let imageAnalysisToken = 0;
  function runImageAnalysis() {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    const scale = Math.min(1, IMG_CAP / Math.max(w, h));
    aw = Math.max(2, Math.round(w * scale));
    ah = Math.max(2, Math.round(h * scale));
    analCanvas.width = aw; analCanvas.height = ah;
    visCanvas.width = aw; visCanvas.height = ah;
    motionView.width = w;
    motionView.height = h;
    prevFrame = null;
    const token = ++imageAnalysisToken;

    const key = 'img|' + mediaKey + '|' + sensBucket();
    const mem = cacheGet(key);
    if (mem && mem.vis) {
      vctx.clearRect(0, 0, aw, ah);
      vctx.drawImage(mem.vis, 0, 0);
      upscaleToMotionView();
      return;
    }

    idb.get(key).then((rec) => {
      if (token !== imageAnalysisToken || !motionOn) return;
      if (rec && rec.aw === aw && rec.ah === ah) {
        restoreVis(rec).then((ok) => {
          if (ok) {
            const e = { vis: cloneCanvas(visCanvas), aw, ah, persisted: true };
            cachePutImage(key, e);
          } else {
            computeImageAnalysis(key, token);
          }
        });
        return;
      }
      computeImageAnalysis(key, token);
    });
  }

  function computeImageAnalysis(key, token) {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return;
    actx.drawImage(img, 0, 0, aw, ah);
    let src;
    try { src = actx.getImageData(0, 0, aw, ah); } catch (err) { return; }
    const sd = src.data;

    const bw = Math.max(2, Math.round(aw / BG_DIVISOR));
    const bh = Math.max(2, Math.round(ah / BG_DIVISOR));
    bgSmall.width = bw; bgSmall.height = bh;
    bsctx.imageSmoothingEnabled = true;
    bsctx.drawImage(analCanvas, 0, 0, bw, bh);
    bgBig.width = aw; bgBig.height = ah;
    bbctx.imageSmoothingEnabled = true;
    bbctx.drawImage(bgSmall, 0, 0, aw, ah);
    let bg;
    try { bg = bbctx.getImageData(0, 0, aw, ah); } catch (err) { return; }
    const bd = bg.data;

    const thr = IMG_THR_LO * Math.pow(IMG_THR_HI / IMG_THR_LO,
                                      1 - motionSensitivity / 100);
    const thrSq = thr * thr;
    const mask = new Float32Array(aw * ah);
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      const dr = sd[p] - bd[p];
      const dg = sd[p + 1] - bd[p + 1];
      const db = sd[p + 2] - bd[p + 2];
      if (dr * dr + dg * dg + db * db > thrSq) mask[i] = MOVE_LEVEL;
    }
    if (token !== imageAnalysisToken) return;
    paintVis(sd, mask);

    const entry = { vis: cloneCanvas(visCanvas), aw, ah, persisted: false };
    cachePutImage(key, entry);
    persistImage(key, entry);        // one-shot: PNG encode is fine here
    entry.persisted = true;
    upscaleToMotionView();
  }

  // ================= Live loop (video) =================
  // RESTORED OLD FAST PATH: rAF + currentTime gate + duplicate freeze.
  // Analysis, render, lens — nothing else. The only cache touch is at a
  // bucket CHANGE (~5/sec): draw vis into a pooled canvas + copy the
  // buffer. No canvas creation, no toBlob, no IndexedDB in this loop —
  // ever. Those were the causes of the fps drops.
  let lastVidTime = -1;
  let lastBucketKey = null;
  function startVideoLoop() {
    if (rafId !== null) return;
    function tick() {
      try {
        if (mode !== 'video') { rafId = null; return; }

        // playback-speed guarantee: never below 1×
        if (vid.defaultPlaybackRate !== 1) vid.defaultPlaybackRate = 1;
        if (vid.playbackRate !== 1) vid.playbackRate = 1;

        if (motionOn && vid.readyState >= 2 && vid.currentTime !== lastVidTime) {
          lastVidTime = vid.currentTime;

          analyzeMotion();
          renderMotionView();

          // RAM snapshot ONLY on bucket change — reused canvases, no allocs
          const key = videoBucketKey(vid.currentTime);
          if (key !== lastBucketKey) {
            lastBucketKey = key;
            const mem = vidCache.get(key);
            if (mem && mem.buf) {
              motionBuf.set(mem.buf);
              vctx.clearRect(0, 0, aw, ah);
              vctx.drawImage(mem.snap, 0, 0);
              upscaleToMotionView();
            } else {
              const snap = snapPool[snapIdx];
              snapIdx = (snapIdx + 1) % snapPool.length;
              const sctx = snap.getContext('2d');
              sctx.clearRect(0, 0, aw, ah);
              sctx.drawImage(visCanvas, 0, 0);
              cachePutVideo(key, snap, motionBuf.slice(), aw, ah);
            }
          }
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
    vid.defaultPlaybackRate = 1;
    vid.playbackRate = 1;
    lastVidTime = -1;
    lastBucketKey = null;
    mediaKey = computeMediaKey(mediaInput.files[0] || null);
    setupVideoAnalysis();
    prepareSampler();
    updateStageVisibility();
    motionBtn.disabled = false;
    startVideoLoop();
  });

  img.addEventListener('load', function () {
    mediaKey = computeMediaKey(mediaInput.files[0] || null);
    prepareSampler();
    lastPoint = null;
    updateStageVisibility();
    motionBtn.disabled = false;
    if (motionOn) runImageAnalysis();
  });
  if (img.complete && img.naturalWidth > 0) {
    mediaKey = computeMediaKey(null);
    prepareSampler();
    updateStageVisibility();
    motionBtn.disabled = false;
  }

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
    motionOn = !!on;
    motionBtn.setAttribute('aria-pressed', String(motionOn));
    motionBtn.classList.toggle('active', motionOn);
    updateStageVisibility();
    if (motionOn) {
      if (mode === 'image') {
        runImageAnalysis();
      } else {
        prevFrame = null;
        lastVidTime = -1;
        lastBucketKey = null;
        motionBuf && motionBuf.fill(0);
      }
    }
  }
  motionBtn.addEventListener('click', function () {
    const loaded = mode === 'video' ? vid.videoWidth : img.naturalWidth;
    if (!loaded) return;
    setMotionView(!motionOn);
  });
  motionSens.addEventListener('input', function () {
    motionSensitivity = parseFloat(this.value);
    motionBadge.textContent = motionSensitivity + '%';
    if (motionOn && mode === 'image') runImageAnalysis();
  });

  // ---------- Unified Browse: images AND videos ----------
  mediaInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    samplerReady = false;
    lastPoint = null;
    pinned = false;
    lens.classList.remove('locked');
    setMotionView(false);
    motionBtn.disabled = true;
    mediaKey = computeMediaKey(file);
    // Cache intentionally NOT cleared — input-type switches keep everything.

    if (file.type.startsWith('video/')) {
      mode = 'video';
      vid.src = URL.createObjectURL(file);
      vid.play().catch(function () {});
    } else {
      mode = 'image';
      stopVideoLoop();
      vid.pause();
      vid.removeAttribute('src');
      img.src = URL.createObjectURL(file);
    }
    updateStageVisibility();

    // Picker hygiene: return to neutral "no file chosen" always.
    e.target.value = '';
  });

  // ================= Template Matching =================
  function toGray(ctx, w, h) {
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0, p = 0; i < g.length; i++, p += 4)
      g[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    return g;
  }

  function asSource(drawable) {
    if (drawable instanceof HTMLCanvasElement && drawable.__tplCtx) {
      return drawable;
    }
    const c = document.createElement('canvas');
    c.width = drawable.naturalWidth || drawable.videoWidth || drawable.width;
    c.height = drawable.naturalHeight || drawable.videoHeight || drawable.height;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(drawable, 0, 0);
    c.__tplCtx = cx;
    return c;
  }

  // Exhaustive scan with early abandonment.
  // `threshold` = mean per-pixel grayscale difference (8 strict, 15–25 fuzzy).
  // `region` = search window [x0,y0,x1,y1] — the bot's mask argument.
  function matchTemplate(frame, tpl, opts = {}) {
    const { threshold = 8, stride = 1, maxHits = Infinity, region = null } = opts;
    const fw = frame.width, fh = frame.height;
    const fg = toGray(frame.__tplCtx, fw, fh);
    const tg = toGray(tpl.__tplCtx, tpl.width, tpl.height);
    const tw = tpl.width, th = tpl.height;
    const tArea = tw * th;
    const worst = threshold * tArea;

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
            if (sum > worst) { dead = true; break; }
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

  function currentFrame() {
    const w = natW(), h = natH();
    if (!w || !h) return null;
    frameCanvas.width = w;
    frameCanvas.height = h;
    try {
      fctx.drawImage(activeMedia(), 0, 0);
    } catch (err) { return null; }
    frameCanvas.__tplCtx = fctx;
    return frameCanvas;
  }

  // Public API:
  //   findTemplate(tplImg, {region, threshold, dedupe})  → [{x,y,score}]
  //   findTemplateFast(tplImg, {threshold})              → pyramid scan
  //   motionCacheStats()                                 → cache sizes
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
  window.motionCacheStats = function () {
    return { ramImages: analysisCache.size, ramVideoBuckets: vidCache.size,
             storage: IDB_NAME + '/' + IDB_STORE };
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
      case 'm': case 'M': setMotionView(!motionOn); break;
    }
  });

  // ---------- Help modal ----------
  helpBtn.addEventListener('click', function () { helpModal.classList.add('open'); });
  closeModal.addEventListener('click', function () { helpModal.classList.remove('open'); });
  helpModal.addEventListener('click', function (event) {
    if (event.target === helpModal) helpModal.classList.remove('open');
  });
})();
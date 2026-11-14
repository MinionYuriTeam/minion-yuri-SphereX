(function () {
  const stage = document.getElementById("stage");
  const img = document.getElementById("image");
  const lens = document.getElementById("lens");
  const lensSizeInput = document.getElementById("lensSize");
  const zoomInput = document.getElementById("zoomLevel");
  const lensBadge = document.getElementById("lensBadge");
  const zoomBadge = document.getElementById("zoomBadge");
  const zoomInBtn = document.getElementById("zoomIn");
  const zoomOutBtn = document.getElementById("zoomOut");
  const coordX = document.getElementById("coordX");
  const coordY = document.getElementById("coordY");
  const hexVal = document.getElementById("hexVal");
  const swatch = document.getElementById("swatch");
  const dimVal = document.getElementById("dimVal");
  const helpBtn = document.getElementById("helpBtn");
  const helpModal = document.getElementById("helpModal");
  const closeModal = document.getElementById("closeModal");

  let lensSize = 180;
  let zoom = 2.5;
  let pinned = false;
  let lastPoint = null;

  const sampleCanvas = document.createElement("canvas");
  const sctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  let samplerReady = false;

  function prepareSampler() {
    sampleCanvas.width = img.naturalWidth;
    sampleCanvas.height = img.naturalHeight;
    sctx.clearRect(0, 0, sampleCanvas.width, sampleCanvas.height);
    try {
      sctx.drawImage(img, 0, 0);
      samplerReady = true;
    } catch (err) {
      samplerReady = false; // image is tainted (no CORS) — coords still work
    }
    dimVal.textContent = img.naturalWidth + " × " + img.naturalHeight;
    coordX.max = img.naturalWidth - 1;
    coordY.max = img.naturalHeight - 1;
  }

  function sampleAt(nx, ny) {
    if (!samplerReady) return null;
    try {
      const d = sctx.getImageData(Math.round(nx), Math.round(ny), 1, 1).data;
      return (
        "#" +
        [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")
      );
    } catch (err) {
      return null;
    }
  }

  function updateLensBackground() {
    lens.style.backgroundImage = 'url("' + img.src + '")';
  }

  img.addEventListener("load", function () {
    updateLensBackground();
    prepareSampler();
    lastPoint = null;
  });
  if (img.complete && img.naturalWidth > 0) {
    updateLensBackground();
    prepareSampler();
  }

  function render() {
    if (!lastPoint || !img.naturalWidth) return;

    const rect = img.getBoundingClientRect();
    const half = lensSize / 2;

    const nx = Math.max(0, Math.min(lastPoint.x, img.naturalWidth - 1));
    const ny = Math.max(0, Math.min(lastPoint.y, img.naturalHeight - 1));
    lastPoint = { x: nx, y: ny };

    const bx = nx * zoom - half;
    const by = ny * zoom - half;

    lens.style.backgroundSize =
      img.naturalWidth * zoom + "px " + img.naturalHeight * zoom + "px";
    lens.style.backgroundPosition = -bx + "px " + -by + "px";

    const dx = (nx / img.naturalWidth) * rect.width;
    const dy = (ny / img.naturalHeight) * rect.height;
    lens.style.left = dx - half + "px";
    lens.style.top = dy - half + "px";

    if (document.activeElement !== coordX) coordX.value = Math.round(nx);
    if (document.activeElement !== coordY) coordY.value = Math.round(ny);

    const hex = sampleAt(nx, ny);
    if (hex) {
      hexVal.textContent = hex.toUpperCase();
      swatch.style.background = hex;
    } else {
      hexVal.textContent = "n/a";
      swatch.style.background = "transparent";
    }

    lensBadge.textContent = lensSize + " px";
    zoomBadge.textContent = zoom.toFixed(1) + "×";
  }

  function showLens() {
    lens.classList.add("visible");
    lens.style.width = lensSize + "px";
    lens.style.height = lensSize + "px";
  }

  stage.addEventListener("mousemove", function (event) {
    if (pinned) return;
    const rect = img.getBoundingClientRect();
    lastPoint = {
      x: ((event.clientX - rect.left) / rect.width) * img.naturalWidth,
      y: ((event.clientY - rect.top) / rect.height) * img.naturalHeight,
    };
    showLens();
    render();
  });

  stage.addEventListener("mouseleave", function () {
    if (!pinned) lens.classList.remove("visible");
  });

  stage.addEventListener("dblclick", function () {
    togglePin();
  });

  stage.addEventListener(
    "wheel",
    function (event) {
      event.preventDefault();
      setZoom(zoom * (event.deltaY < 0 ? 1.1 : 0.9));
    },
    { passive: false },
  );

  stage.addEventListener(
    "touchmove",
    function (event) {
      event.preventDefault();
      const t = event.touches[0];
      const rect = img.getBoundingClientRect();
      lastPoint = {
        x: ((t.clientX - rect.left) / rect.width) * img.naturalWidth,
        y: ((t.clientY - rect.top) / rect.height) * img.naturalHeight,
      };
      showLens();
      render();
    },
    { passive: false },
  );
  stage.addEventListener("touchend", function () {
    if (!pinned) lens.classList.remove("visible");
  });

  function togglePin() {
    pinned = !pinned;
    lens.classList.toggle("locked", pinned);
    if (pinned) showLens();
  }

  function jumpToManual() {
    const x = parseFloat(coordX.value);
    const y = parseFloat(coordY.value);
    if (isNaN(x) || isNaN(y)) return;
    lastPoint = { x: x, y: y };
    pinned = true;
    showLens();
    lens.classList.add("locked");
    render();
  }
  coordX.addEventListener("change", jumpToManual);
  coordY.addEventListener("change", jumpToManual);
  [coordX, coordY].forEach((el) =>
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") jumpToManual();
    }),
  );

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

  zoomInBtn.addEventListener("click", function () {
    setZoom(zoom + 0.5);
  });
  zoomOutBtn.addEventListener("click", function () {
    setZoom(zoom - 0.5);
  });

  lensSizeInput.addEventListener("input", function () {
    setLensSize(parseInt(this.value, 10));
  });
  zoomInput.addEventListener("input", function () {
    zoom = parseFloat(this.value);
    render();
  });

  document.getElementById("fileInput").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    samplerReady = false;
    lastPoint = null;
    img.removeAttribute("src");
    img.src = URL.createObjectURL(file);
  });

  window.addEventListener("keydown", function (event) {
    if (event.target.tagName === "INPUT") return;

    if (event.key === "Escape" && helpModal.classList.contains("open")) {
      helpModal.classList.remove("open");
      return;
    }

    switch (event.key) {
      case "+":
      case "=":
        setZoom(zoom + 0.5);
        break;
      case "-":
      case "_":
        setZoom(zoom - 0.5);
        break;
      case "[":
        setLensSize(lensSize - 20);
        break;
      case "]":
        setLensSize(lensSize + 20);
        break;
      case "p":
      case "P":
        togglePin();
        break;
    }
  });

  helpBtn.addEventListener("click", function () {
    helpModal.classList.add("open");
  });
  closeModal.addEventListener("click", function () {
    helpModal.classList.remove("open");
  });
  helpModal.addEventListener("click", function (event) {
    if (event.target === helpModal) helpModal.classList.remove("open");
  });
})();

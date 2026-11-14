(function () {
  const stage = document.getElementById('stage');
  const img = document.getElementById('image');
  const lens = document.getElementById('lens');
  const lensSizeInput = document.getElementById('lensSize');
  const zoomInput = document.getElementById('zoomLevel');

  let lensSize = 180;   // diameter of the lens in px
  let zoom = 2.5;       // magnification factor

  // Wait until the image is fully loaded so we know its natural size
  function updateLensBackground() {
    lens.style.backgroundImage = 'url("' + img.src + '")';
  }
  if (img.complete) {
    updateLensBackground();
  } else {
    img.addEventListener('load', updateLensBackground);
  }

  function moveLens(event) {
    // Position of the image on the page
    const rect = img.getBoundingClientRect();

    // Mouse position relative to the image
    let x = event.clientX - rect.left;
    let y = event.clientY - rect.top;

    // Keep the lens centered on the cursor, clamped to the image bounds
    const half = lensSize / 2;
    x = Math.max(0, Math.min(x, rect.width));
    y = Math.max(0, Math.min(y, rect.height));

    // Convert image pixels -> natural (full-resolution) pixels,
    // then multiply by zoom, to find the background sampling point.
    const nx = x / rect.width * img.naturalWidth;
    const ny = y / rect.height * img.naturalHeight;
    const bx = nx * zoom - half;
    const by = ny * zoom - half;

    lens.style.backgroundSize =
      (img.naturalWidth * zoom) + 'px ' + (img.naturalHeight * zoom) + 'px';
    lens.style.backgroundPosition = (-bx) + 'px ' + (-by) + 'px';

    // Place the lens element itself
    lens.style.left = (x - half) + 'px';
    lens.style.top = (y - half) + 'px';
  }

  stage.addEventListener('mousemove', function (event) {
    lens.classList.add('visible');
    lens.style.width = lensSize + 'px';
    lens.style.height = lensSize + 'px';
    moveLens(event);
  });

  stage.addEventListener('mouseleave', function () {
    lens.classList.remove('visible');
  });

  // Also support touch for mobile
  stage.addEventListener('touchmove', function (event) {
    event.preventDefault();
    lens.classList.add('visible');
    lens.style.width = lensSize + 'px';
    lens.style.height = lensSize + 'px';
    moveLens(event.touches[0]);
  }, { passive: false });
  stage.addEventListener('touchend', function () {
    lens.classList.remove('visible');
  });

  lensSizeInput.addEventListener('input', function () {
    lensSize = parseInt(this.value, 10);
  });

  zoomInput.addEventListener('input', function () {
    zoom = parseFloat(this.value);
  });

  document.getElementById('fileInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    img.src = url;
    updateLensBackground();
  });
})();
(function () {
  const DETECT_PARAMS = {
    shiftfactor: 0.1, // Move the detection window by 10% of its size
    minsize: 100, // Minimum size of a face
    maxsize: 800, // Maximum size of a face
    scalefactor: 1.1, // For multiscale processing: resize the detection window by 10% when moving to the higher scale
  };

  const MAX_VIEW_W = 540;
  const DEF_VIEW_W = 480;
  const DEF_VIEW_H = 640;
  let scrW, scrH, viewW, viewH;
  let count, prev_up, prev_down, squat_done, up_y, down_y;
  let isHorizontal = undefined;
  let initialized = false;

  function onResizeWindow() {
    scrW = window.innerWidth;
    scrH = window.innerHeight;

    // Reload entire window when screen direction changes.
    if (isHorizontal !== scrW > scrH && isHorizontal !== undefined) {
      window.location.reload();
      return;
    }

    // Ignore if already camera is started and just resizing window.
    if (initialized) {
      return;
    }

    isHorizontal = scrW > scrH;
    console.log('onResizeWindow', { scrW, scrH, is_horizontal: isHorizontal });

    const ratio = isHorizontal
      ? DEF_VIEW_W / DEF_VIEW_H
      : DEF_VIEW_H / DEF_VIEW_W;
    viewW = Math.min(scrW, MAX_VIEW_W);
    viewH = viewW * ratio;
    count = 0;
    prev_up = false;
    prev_down = false;
    squat_done = false;

    setDefaultBarPosition();
    setCanvasSize();
    startCamera();
  }

  function setCanvasSize() {
    if (viewW <= 0 || viewH <= 0) return;

    const canvas = document.querySelector('#camera');
    canvas.setAttribute('width', viewW);
    canvas.style.width = viewW;
    canvas.setAttribute('height', viewH);
    canvas.style.height = viewH;
  }

  function setDefaultBarPosition() {
    up_y = (viewH * 0.36) | 0;
    down_y = (viewH * 0.64) | 0;
  }

  function startCamera() {
    if (initialized) return;

    // Initialize the pico.js face detector
    const update_memory = pico.instantiate_detection_memory(10);
    let facefinder_classify_region = (r, c, s, pixels, ldim) => -1.0;

    const cascadeurl = './facefinder.dat';
    fetch(cascadeurl).then(function (response) {
      response.arrayBuffer().then(function (buffer) {
        let bytes = new Int8Array(buffer);
        facefinder_classify_region = pico.unpack_cascade(bytes);
        console.log('* facefinder loaded');
      });
    });

    // Get the drawing context on the canvas and define a function to transform an RGBA image to grayscale.
    const canvas = document.querySelector('#camera');

    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 3;
    ctx.font = '12vmin sans-serif';
    ctx.textAlign = 'center';

    function rgba_to_grayscale(rgba, nrows, ncols) {
      var gray = new Uint8Array(nrows * ncols);
      for (var r = 0; r < nrows; ++r)
        for (var c = 0; c < ncols; ++c)
          // gray = 0.2*red + 0.7*green + 0.1*blue
          gray[r * ncols + c] =
            (2 * rgba[r * 4 * ncols + 4 * c + 0] +
              7 * rgba[r * 4 * ncols + 4 * c + 1] +
              1 * rgba[r * 4 * ncols + 4 * c + 2]) /
            10;
      return gray;
    }

    function onDraw(video, dt) {
      // Render the video frame to the canvas.
      ctx.save();
      ctx.translate(viewW, 0); // Flip horizontally
      ctx.scale(-1, 1); // Flip horizontally
      ctx.drawImage(video, 0, 0, viewW, viewH);
      ctx.restore();

      // Extract RGBA pixel data.
      const rgba = ctx.getImageData(0, 0, viewW, viewH).data;

      // Prepare input data to `run_cascade`
      image = {
        pixels: rgba_to_grayscale(rgba, viewH, viewW),
        nrows: viewH,
        ncols: viewW,
        ldim: viewW,
      };

      // Run the cascade over the frame and cluster the obtained detections.
      //    dets is an array that contains (r, c, s, q) quadruplets
      //    (representing row, column, scale and detection score)
      dets = pico.run_cascade(image, facefinder_classify_region, DETECT_PARAMS);
      dets = update_memory(dets);
      dets = pico.cluster_detections(dets, 0.2); // Set IoU threshold to 0.2

      // Draw detections
      for (i = 0; i < dets.length; ++i) {
        // Check the detection score. Draw a circle if it's above the threshold.
        if (dets[i][3] > 50.0) {
          const x = dets[i][1];
          const y = dets[i][0];
          ctx.beginPath();
          ctx.arc(x, y, dets[i][2] / 2, 0, 2 * Math.PI, false);
          ctx.strokeStyle = squat_done ? 'blue' : 'red';
          ctx.stroke();

          updateStatus(y <= up_y, y >= down_y);
        }
      }

      drawStatus(ctx, video);
    }

    // Start camera handling (see https://github.com/cbrandolino/camvas)
    new camvas(ctx, onDraw);
    initialized = true;
  }

  function drawLine(ctx, x0, y0, x1, y1, style, dashed = false) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = style;
    if (dashed) {
      ctx.setLineDash([5, 5]);
    }
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  function drawStatus(ctx, video) {
    ctx.save();

    drawLine(ctx, 0, up_y, viewW, up_y, 'aqua', true);
    drawLine(ctx, 0, down_y, viewW, down_y, 'pink', true);

    if (squat_done) {
      drawLine(ctx, 0, up_y, viewW, up_y, 'blue', true);
    } else {
      drawLine(ctx, 0, down_y, viewW, down_y, 'red', true);
    }

    ctx.font = '12vmin sans-serif';
    ctx.fillStyle = squat_done ? 'red' : 'blue';
    ctx.fillText(count, viewW / 2, viewH * 0.14);

    const msg = squat_done ? '' : 'Ready';
    ctx.font = '7vmin sans-serif';
    ctx.fillStyle = 'blue';
    ctx.fillText(msg, viewW / 2, viewH * 0.23);

    // //------ For Debugging
    // drawDebug(ctx, video);

    ctx.restore();
  }

  function drawDebug(ctx, video) {
    ctx.font = '2.8vmin sans-serif';
    ctx.fillStyle = 'yellow';
    ctx.fillText(
      `view=(${viewW | 0},${viewH | 0}), bars=(${up_y}-${down_y})`,
      (viewW / 2) | 0,
      (viewH * 0.86) | 0
    );
    ctx.fillText(
      `video=(${video.videoWidth},${video.videoHeight})`,
      (viewW / 2) | 0,
      (viewH * 0.91) | 0
    );

    ctx.fillText(
      `canvas=(${ctx.canvas.width},${ctx.canvas.height}), SCR=(${scrW}, ${scrH})`,
      (viewW / 2) | 0,
      (viewH * 0.96) | 0
    );
  }

  function updateStatus(up, down) {
    if (up && !prev_up) {
      squat_done = false;
    }
    if (down && !prev_down && !squat_done) {
      count++;
      squat_done = true;
    }

    prev_up = up;
    prev_down = down;
  }

  function onClickUpDownButton(e) {
    const value = parseInt(e.target.dataset.value, 10);
    const target = e.target.dataset.target;
    if (target === 'up_y') up_y += value;
    if (target === 'down_y') down_y += value;
  }

  document.querySelectorAll('.settings button[data-value]').forEach((el) => {
    el.addEventListener('click', onClickUpDownButton);
  });

  document.addEventListener('dblclick', () => false);

  let timer = undefined;
  window.addEventListener('resize', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onResizeWindow, 100);
  });

  onResizeWindow();
})();

(function () {
  const DETECT_PARAMS = {
    shiftfactor: 0.1, // Move the detection window by 10% of its size
    minsize: 100, // Minimum size of a face
    maxsize: 800, // Maximum size of a face
    scalefactor: 1.1, // For multiscale processing: resize the detection window by 10% when moving to the higher scale
  };

  let SCR_W, SCR_H, is_horizontal, vw, vh, initialized;
  let count, prev_up, prev_down, squat_done, up_y, down_y;

  function onResizeWindow() {
    SCR_W = window.innerWidth;
    SCR_H = window.innerHeight;
    is_horizontal = SCR_W > SCR_H;
    console.log('onResizeWindow', {
      scr_w: SCR_W,
      scr_h: SCR_H,
      is_horizontal,
    });

    const ratio = is_horizontal ? 240 / 320 : 320 / 240;
    vw = SCR_W;
    vh = SCR_W * ratio;
    initialized = false;
    count = 0;
    prev_up = false;
    prev_down = false;
    squat_done = false;

    setDefaultBarPosition();
    setCanvasSize();
    startCamera();
  }

  function setCanvasSize() {
    if (vw <= 0 || vh <= 0) return;

    const canvas = document.querySelector('#camera');
    const ratio = is_horizontal ? SCR_H / vh : SCR_W / vw;
    const w = vw * ratio;
    const h = vh * ratio;

    canvas.setAttribute('width', w);
    canvas.style.width = w;
    canvas.setAttribute('height', h);
    canvas.style.height = h;
  }

  function setDefaultBarPosition() {
    up_y = (vh * 0.36) | 0;
    down_y = (vh * 0.64) | 0;
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
    ctx.font = '42px sans-serif';
    ctx.textAlign = 'center';
    // ctx.scale(-1, 1);

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

    // This function is called each time a video frame becomes available.
    const processfn = function (video, dt) {
      // Render the video frame to the canvas.
      ctx.save();
      ctx.translate(vw, 0); // Flip horizontally
      ctx.scale(-1, 1); // Flip horizontally
      ctx.drawImage(video, 0, 0, vw, vh);
      ctx.restore();

      // Extract RGBA pixel data.
      const rgba = ctx.getImageData(0, 0, vw, vh).data;

      // Prepare input data to `run_cascade`
      image = {
        pixels: rgba_to_grayscale(rgba, vh, vw),
        nrows: vh,
        ncols: vw,
        ldim: vw,
      };

      // Run the cascade over the frame and cluster the obtained detections.
      //    dets is an array that contains (r, c, s, q) quadruplets
      //    (representing row, column, scale and detection score)
      dets = pico.run_cascade(image, facefinder_classify_region, DETECT_PARAMS);
      dets = update_memory(dets);
      dets = pico.cluster_detections(dets, 0.2); // Set IoU threshold to 0.2

      // Draw detections
      for (i = 0; i < dets.length; ++i) {
        // Check the detection score. If it's above the threshold, draw it.
        // (The constant 50.0 is empirical: other cascades might require a different one)
        if (dets[i][3] > 50.0) {
          const x = dets[i][1];
          const y = dets[i][0];
          ctx.beginPath();
          ctx.arc(x, y, dets[i][2] / 2, 0, 2 * Math.PI, false);
          ctx.strokeStyle = squat_done ? 'blue' : 'red';
          ctx.stroke();

          //   console.log(`(${x}, ${y})`);
          updateStatus(y <= up_y, y >= down_y);
        }
      }

      drawStatus(ctx, video);
    };

    // Instantiate camera handling (see https://github.com/cbrandolino/camvas)
    new camvas(ctx, processfn);
    initialized = true;
  }

  function drawLine(ctx, x0, y0, x1, y1, style) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = style;
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  function drawStatus(ctx, video) {
    ctx.save();

    drawLine(ctx, 0, up_y, vw, up_y, 'aqua');
    drawLine(ctx, 0, down_y, vw, down_y, 'pink');

    if (squat_done) {
      drawLine(ctx, 0, up_y, vw, up_y, 'blue');
    } else {
      drawLine(ctx, 0, down_y, vw, down_y, 'red');
    }

    ctx.font = '44px sans-serif';
    ctx.fillStyle = squat_done ? 'red' : 'blue';
    ctx.fillText(count, vw / 2, 50);

    const msg = squat_done ? '' : 'Ready';
    ctx.font = '38px sans-serif';
    ctx.fillStyle = 'blue';
    ctx.fillText(msg, vw / 2, 90);

    // ctx.font = '16px sans-serif';
    // ctx.fillStyle = 'yellow';
    // ctx.fillText(
    //   `view=(${vw | 0},${vh | 0}), bars=(${up_y}-${down_y})`,
    //   (vw / 2) | 0,
    //   (vh - 56) | 0
    // );
    // ctx.fillText(
    //   `video=(${video.videoWidth},${video.videoHeight})`,
    //   (vw / 2) | 0,
    //   (vh - 38) | 0
    // );

    // ctx.fillText(
    //   `canvas=(${ctx.canvas.width},${ctx.canvas.height}), SCR=(${SCR_W}, ${SCR_H})`,
    //   (vw / 2) | 0,
    //   (vh - 20) | 0
    // );

    ctx.restore();
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

  document.querySelectorAll('.settings button[data-value]').forEach((elem) => {
    elem.addEventListener('click', onClickUpDownButton);
  });

  document.addEventListener('dblclick', () => false);

  let timer = undefined;
  window.addEventListener('resize', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onResizeWindow, 200);
  });

  onResizeWindow();
})();

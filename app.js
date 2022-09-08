const scr_w = window.innerWidth;
const scr_h = window.innerHeight;
const is_horizontal = scr_w >= scr_h;
console.log({ scr_w, scr_h, is_horizontal });

function app() {
  // const base_w = is_horizontal ? 640 : 480;
  // const ratio = scr_w / base_w;
  let WIDTH = scr_w; //(is_horizontal ? 640 : 480) * ratio;
  let HEIGHT = scr_h; //(is_horizontal ? 480 : 640) * ratio;

  const DETECT_PARAMS = {
    shiftfactor: 0.1, // Move the detection window by 10% of its size
    minsize: 100, // Minimum size of a face
    maxsize: 800, // Maximum size of a face
    scalefactor: 1.1, // For multiscale processing: resize the detection window by 10% when moving to the higher scale
  };

  let initialized = false;
  let up_y = 200;
  let down_y = 320;
  let count = 0;
  let prev_up = false;
  let prev_down = false;
  let squat_done = false;

  function setCanvasSize(w, h) {
    const canvas = document.querySelector('#camera');
    if (w > 0) {
      canvas.setAttribute('width', w);
      canvas.style.width = w;
    }
    if (h > 0) {
      canvas.setAttribute('height', h);
      canvas.style.height = h;
    }
  }

  function onClickStart() {
    if (initialized) return;

    // Initialize the pico.js face detector
    const update_memory = pico.instantiate_detection_memory(10);
    let facefinder_classify_region = (r, c, s, pixels, ldim) => -1.0;

    const cascadeurl = './facefinder.dat';
    fetch(cascadeurl).then(function(response) {
      response.arrayBuffer().then(function(buffer) {
        let bytes = new Int8Array(buffer);
        facefinder_classify_region = pico.unpack_cascade(bytes);
        console.log('* facefinder loaded');
      });
    });

    // Get the drawing context on the canvas and define a function to transform an RGBA image to grayscale.
    const ctx = document.getElementsByTagName('canvas')[0].getContext('2d');
    ctx.lineWidth = 3;
    ctx.font = '42px sans-serif';
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

    // This function is called each time a video frame becomes available.
    const processfn = function(video, dt) {
      // Render the video frame to the canvas.
      // ctx.drawImage(video, (WIDTH - video.videoWidth) / 2, (HEIGHT - video.videoHeight) / 2, video.videoWidth, video.videoHeight);
      ctx.drawImage(video, 0, 0, WIDTH, HEIGHT);

      // Extract RGBA pixel data.
      const rgba = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
      // Prepare input to `run_cascade`
      image = {
        pixels: rgba_to_grayscale(rgba, HEIGHT, WIDTH),
        nrows: HEIGHT,
        ncols: WIDTH,
        ldim: WIDTH,
      };

      // Run the cascade over the frame and cluster the obtained detections
      // dets is an array that contains (r, c, s, q) quadruplets
      // (representing row, column, scale and detection score)
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

      drawStatus(ctx);
    };

    function notifyCameraRes(w, h) {
      // console.log('notifyCameraRes', { w, h });
      if (w > 0) WIDTH = w;
      if (h > 0) HEIGHT = h;
      setCanvasSize(w, h);
    }

    // Instantiate camera handling (see https://github.com/cbrandolino/camvas)
    new camvas(ctx, processfn, notifyCameraRes);
    initialized = true;
  }

  function drawLine(ctx, x0, y0, x1, y1, style) {
    ctx.beginPath();
    ctx.strokeStyle = style;
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  function drawStatus(ctx) {
    drawLine(ctx, 0, up_y, WIDTH, up_y, 'aqua');
    drawLine(ctx, 0, down_y, WIDTH, down_y, 'pink');

    if (squat_done) {
      drawLine(ctx, 0, up_y, WIDTH, up_y, 'blue');
    } else {
      drawLine(ctx, 0, down_y, WIDTH, down_y, 'red');
    }

    ctx.fillStyle = squat_done ? 'red' : 'blue';
    ctx.fillText(count, WIDTH / 2, 50);

    const msg = squat_done ? '' : 'Ready';
    ctx.fillStyle = 'blue';
    ctx.fillText(msg, WIDTH / 2, 90);
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

  function onChangeUpDownY(e) {
    const id = e.target.id;
    if (id === 'up_y') {
      up_y = parseInt(e.target.value, 10);
    }
    if (id === 'down_y') {
      down_y = parseInt(e.target.value, 10);
    }
  }

  function onClickUpDownButton(e) {
    const value = parseInt(e.target.dataset.value, 10);
    const parent = e.target.parentElement;
    const input = parent.querySelector('input[type=number]');
    input.value = parseInt(input.value, 10) + value;
    onChangeUpDownY({ target: input });
  }

  document.querySelectorAll('#up_y, #down_y').forEach((elem) => {
    elem.addEventListener('change', onChangeUpDownY);
  });

  document.querySelectorAll('.settings button[data-value]').forEach((elem) => {
    elem.addEventListener('click', onClickUpDownButton);
  });

  document.querySelector('#btn_start').addEventListener('click', onClickStart);

  document.addEventListener('dblclick', () => false);

  setCanvasSize(WIDTH, HEIGHT);
  onClickStart();
}

app();

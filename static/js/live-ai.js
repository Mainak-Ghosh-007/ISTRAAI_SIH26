/* =========================================================
   LIVE AI CAMERA
   Browser webcam permission + existing server-side AI tracking
   ========================================================= */

(function () {

  const $ = id => document.getElementById(id);

  let socket = null;
  let initialized = false;
  let running = false;
  let localStream = null;

  const MAX = 60;
  const errors = [];
  const labels = [];


  /* =========================================================
     TRACKING MODE SWITCH
     ========================================================= */

  window.showTrackingMode = function (mode) {

    const sim = $('simPanel');
    const live = $('liveAiPanel');
    const tabSim = $('tabSim');
    const tabLive = $('tabLive');

    if (!sim || !live) return;

    if (mode === 'live') {

      sim.style.display = 'none';
      live.style.display = 'block';

      if (tabSim) tabSim.classList.remove('active');
      if (tabLive) tabLive.classList.add('active');

      initLiveAI();

      setTimeout(() => {
        updateChartTitle();
        drawChart();
        resizeLiveOverlay();
      }, 80);

    } else {

      sim.style.display = 'block';
      live.style.display = 'none';

      if (tabLive) tabLive.classList.remove('active');
      if (tabSim) tabSim.classList.add('active');

      stopLocalCamera();

    }
  };


  /* =========================================================
     COMPATIBILITY INITIALIZER
     ========================================================= */

  window.initLiveTracking = function () {

    const sim = $('simPanel');
    const live = $('liveAiPanel');
    const tabSim = $('tabSim');
    const tabLive = $('tabLive');

    if (sim) sim.style.display = 'block';
    if (live) live.style.display = 'none';

    if (tabSim) tabSim.classList.add('active');
    if (tabLive) tabLive.classList.remove('active');

    initLiveAI();
  };


  /* =========================================================
     HELPERS
     ========================================================= */

  function text(id, value) {
    const e = $(id);
    if (e) e.textContent = value;
  }

  function badge(id, value) {
    text(id, value);
  }


  /* =========================================================
     INITIALIZE
     ========================================================= */

  function initLiveAI() {

    updateChartTitle();

    if (initialized) {
      loadStatus();
      return;
    }

    initialized = true;

    if (typeof io === 'undefined') {

      text(
        'liveEmptyMsg',
        'Socket.IO client failed to load.'
      );

      return;
    }

    socket = io();

    socket.on(
      'tracking_update',
      update
    );

    socket.on(
      'live_alert',
      a => renderAlert(a, false)
    );

    loadStatus();


    /* Historical tracking data */

    fetch('/api/live/history?limit=' + MAX)

      .then(r => r.json())

      .then(rows => {

        rows.forEach(r => {
          push(r.t, r.total_error);
        });

        drawChart();

      })

      .catch(() => {});


    /* Previous alerts */

    fetch('/api/live/alerts?limit=20')

      .then(r => r.json())

      .then(rows => {

        rows
          .reverse()
          .forEach(a => renderAlert(a, true));

      })

      .catch(() => {});


    setTimeout(
      resizeLiveOverlay,
      100
    );
  }


  /* =========================================================
     CAMERA STATUS
     ========================================================= */

  function loadStatus() {

    fetch('/api/live/status')

      .then(r => r.json())

      .then(s => {

        badge(
          'liveCameraModeBadge',
          'CAMERA: ' +
          String(
            s.camera_mode || 'BROWSER'
          ).toUpperCase()
        );

        badge(
          'liveDetectorBadge',
          'DETECTOR: ' +
          String(
            s.detector || '—'
          ).toUpperCase()
        );

        badge(
          'liveRunBadge',
          s.running ? 'RUNNING' : 'STOPPED'
        );

        running = !!s.running;

      })

      .catch(() => {});
  }


  /* =========================================================
     BROWSER CAMERA
     ========================================================= */

  async function startBrowserCamera() {

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {

      throw new Error(
        'Camera access is not supported by this browser.'
      );
    }


    /*
       Ask the browser for the user's real camera.

       This triggers the normal:
       "Allow camera?" permission popup.
    */

    localStream =
      await navigator.mediaDevices.getUserMedia({

        video: {
          facingMode: {
            ideal: 'environment'
          },

          width: {
            ideal: 1280
          },

          height: {
            ideal: 720
          },

          frameRate: {
            ideal: 30
          }

        },

        audio: false
      });


    /*
       Use the existing video element if available.
       If the page currently uses an <img>, create a video
       element and place it in the same container.
    */

    let video = $('liveCameraVideo');

    const img = $('liveFeedImg');


    if (!video) {

      video = document.createElement('video');

      video.id = 'liveCameraVideo';

      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;

      video.setAttribute(
        'playsinline',
        ''
      );

      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';


      if (img && img.parentElement) {

        img.style.display = 'none';

        img.parentElement.appendChild(video);

      }

    }


    video.srcObject = localStream;

    video.style.display = 'block';

    await video.play();


    resizeLiveOverlay();

    return video;
  }


  /* =========================================================
     STOP BROWSER CAMERA
     ========================================================= */

  function stopLocalCamera() {

    if (localStream) {

      localStream
        .getTracks()
        .forEach(track => track.stop());

      localStream = null;
    }


    const video = $('liveCameraVideo');

    if (video) {

      video.pause();
      video.srcObject = null;
      video.style.display = 'none';

    }
  }


  /* =========================================================
     START LIVE AI
     ========================================================= */

  window.startLiveAI = async function () {

    try {

      badge(
        'liveRunBadge',
        'REQUESTING CAMERA...'
      );


      /*
         IMPORTANT:
         Browser asks for permission FIRST.
      */

      await startBrowserCamera();


      /*
         Now start the existing AI tracking backend.
         This keeps your existing telemetry/tracking system.
      */

      const response = await fetch(
        '/api/live/start',
        {
          method: 'POST'
        }
      );


      const s = await response.json();


      if (!response.ok || !s.ok) {

        throw new Error(
          s.error ||
          'Unable to start AI tracking.'
        );
      }


      running = true;


      /*
         Hide the old server webcam <img>.
         The browser camera video is now displayed.
      */

      const img = $('liveFeedImg');

      if (img) {
        img.style.display = 'none';
      }


      const empty = $('liveEmptyMsg');

      if (empty) {
        empty.style.display = 'none';
      }


      badge(
        'liveRunBadge',
        'RUNNING'
      );


      badge(
        'liveDetectorBadge',
        'DETECTOR: ' +
        String(
          s.detector || 'AI'
        ).toUpperCase()
      );


      badge(
        'liveCameraModeBadge',
        'CAMERA: BROWSER'
      );


      const assistantStatus =
        $('assistantStatus');


      if (assistantStatus) {

        assistantStatus.textContent =
          'WAITING';

        assistantStatus.style.color =
          '#1769e0';
      }


      updateAssistant({
        found: false
      });


      updateChartTitle();
      drawChart();
      resizeLiveOverlay();


    } catch (error) {

      console.error(
        'Camera error:',
        error
      );


      running = false;

      stopLocalCamera();


      const empty =
        $('liveEmptyMsg');


      if (empty) {

        empty.style.display =
          'flex';

        empty.textContent =
          'WEBCAM ERROR: ' +
          error.message;

      }


      badge(
        'liveRunBadge',
        'CAMERA ERROR'
      );


      updateAssistant({
        found: false
      });

    }
  };


  /* =========================================================
     STOP LIVE AI
     ========================================================= */

  window.stopLiveAI = function () {

    fetch(
      '/api/live/stop',
      {
        method: 'POST'
      }
    )

    .catch(() => {})

    .finally(() => {

      running = false;

      stopLocalCamera();


      const img =
        $('liveFeedImg');


      if (img) {

        img.removeAttribute('src');

        img.style.display =
          'none';
      }


      const empty =
        $('liveEmptyMsg');


      if (empty) {

        empty.style.display =
          'flex';

        empty.textContent =
          'Click "Start Live AI Tracking" to open the physical webcam.';
      }


      badge(
        'liveRunBadge',
        'STOPPED'
      );


      clearOverlay();


      updateAssistant({
        found: false
      });


      drawChart();

    });

  };


  /* =========================================================
     TRACKING UPDATE
     ========================================================= */

  function update(d) {

    if (!running) return;


    updateAssistant(d);


    if (!d.found) {

      badge(
        'livePhasePill',
        'SEARCHING'
      );

      clearOverlay();

      return;
    }


    badge(
      'livePhasePill',
      d.phase
    );


    const phasePill =
      $('livePhasePill');


    if (phasePill) {

      phasePill.className =
        'pill ' +
        (
          d.phase === 'FINE LOCK'
            ? 'green'
            : d.phase &&
              d.phase.includes('ALIGNMENT')
              ? 'blue'
              : 'amber'
        );
    }


    /*
       Keep the rest of your existing tracking overlay,
       chart and telemetry logic unchanged.
    */

    drawTrackingOverlay(d);

    push(
      d.t || new Date().toLocaleTimeString(),
      d.total_error || 0
    );

    drawChart();
  }


  /* =========================================================
     TRACKING OVERLAY
     ========================================================= */

  function drawTrackingOverlay(d) {

    if (!d || !d.found) {
      clearOverlay();
      return;
    }


    const overlay =
      $('liveOverlayCanvas');


    if (!overlay) return;


    const ctx =
      overlay.getContext('2d');


    if (!ctx) return;


    resizeLiveOverlay();


    ctx.clearRect(
      0,
      0,
      overlay.width,
      overlay.height
    );


    const cx =
      d.cx !== undefined
        ? d.cx
        : overlay.width / 2;


    const cy =
      d.cy !== undefined
        ? d.cy
        : overlay.height / 2;


    const radius = 35;


    ctx.beginPath();

    ctx.arc(
      cx,
      cy,
      radius,
      0,
      Math.PI * 2
    );

    ctx.strokeStyle =
      '#00ff88';

    ctx.lineWidth = 3;

    ctx.stroke();


    /*
       Four-part target reticle
    */

    const gap = 10;
    const len = 18;


    ctx.beginPath();

    ctx.moveTo(cx - gap - len, cy - gap - len);
    ctx.lineTo(cx - gap, cy - gap);

    ctx.moveTo(cx + gap, cy - gap);
    ctx.lineTo(cx + gap + len, cy - gap - len);

    ctx.moveTo(cx - gap - len, cy + gap + len);
    ctx.lineTo(cx - gap, cy + gap);

    ctx.moveTo(cx + gap, cy + gap);
    ctx.lineTo(cx + gap + len, cy + gap + len);

    ctx.stroke();

  }


  /* =========================================================
     RESIZE OVERLAY
     ========================================================= */

  window.resizeLiveOverlay = function () {

    const canvas =
      $('liveOverlayCanvas');


    const video =
      $('liveCameraVideo');


    if (!canvas) return;


    const target =
      video ||
      $('liveFeedImg');


    if (!target) return;


    const rect =
      target.getBoundingClientRect();


    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return;
    }


    canvas.width =
      rect.width;


    canvas.height =
      rect.height;


    canvas.style.width =
      rect.width + 'px';


    canvas.style.height =
      rect.height + 'px';

  };


  window.addEventListener(
    'resize',
    resizeLiveOverlay
  );


  /* =========================================================
     CLEAR OVERLAY
     ========================================================= */

  window.clearOverlay = function () {

    const canvas =
      $('liveOverlayCanvas');


    if (!canvas) return;


    const ctx =
      canvas.getContext('2d');


    if (!ctx) return;


    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

  };


  /* =========================================================
     CHART DATA
     ========================================================= */

  function push(label, value) {

    labels.push(label);
    errors.push(Number(value) || 0);


    if (labels.length > MAX) {
      labels.shift();
      errors.shift();
    }
  }


  function updateChartTitle() {

    const title =
      $('trackingChartTitle');


    if (title) {

      title.textContent =
        'Tracking Error vs Time';
    }
  }


  function drawChart() {

    const canvas =
      $('trackingChart');


    if (!canvas) return;


    const ctx =
      canvas.getContext('2d');


    if (!ctx) return;


    const rect =
      canvas.getBoundingClientRect();


    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return;
    }


    const dpr =
      window.devicePixelRatio || 1;


    canvas.width =
      rect.width * dpr;


    canvas.height =
      rect.height * dpr;


    ctx.scale(
      dpr,
      dpr
    );


    const width =
      rect.width;


    const height =
      rect.height;


    ctx.clearRect(
      0,
      0,
      width,
      height
    );


    if (errors.length < 2) return;


    const max =
      Math.max(
        1,
        ...errors
      );


    const min =
      Math.min(
        0,
        ...errors
      );


    const range =
      Math.max(
        1,
        max - min
      );


    ctx.beginPath();


    errors.forEach(
      (value, index) => {

        const x =
          index *
          (
            width /
            Math.max(
              1,
              errors.length - 1
            )
          );


        const y =
          height -
          (
            (
              value - min
            ) /
            range
          ) *
          height;


        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

      }
    );


    ctx.strokeStyle =
      '#1769e0';

    ctx.lineWidth = 2;

    ctx.stroke();

  }


  /* =========================================================
     ASSISTANT
     ========================================================= */

  function updateAssistant(d) {

    if (!d) return;


    const status =
      $('assistantStatus');


    if (!status) return;


    if (d.found) {

      status.textContent =
        'TRACKING';

      status.style.color =
        '#16a34a';

    } else {

      status.textContent =
        'SEARCHING';

      status.style.color =
        '#1769e0';

    }
  }


  /* =========================================================
     ALERT RENDERING
     ========================================================= */

  function renderAlert(a, historical) {

    const list =
      $('liveAlerts');


    if (!list) return;


    const item =
      document.createElement('div');


    item.className =
      'live-alert';


    item.textContent =
      a.message ||
      a.alert ||
      'Tracking alert';


    if (historical) {
      item.dataset.historical = 'true';
    }


    list.prepend(item);

  }


})();

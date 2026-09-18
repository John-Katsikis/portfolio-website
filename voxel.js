/* ==================================================================
   voxel.js — the Panda logo as a 3D voxel sculpture
   ------------------------------------------------------------------
   Samples the logo PNG into a coarse grid, keeps the coloured and
   bright pixels as cubes, and renders them with a tiny software
   rasteriser on a 2D canvas (painter's algorithm, three lit faces per
   cube). The sculpture idles with a slow tilt and a breathing wave,
   tilts toward the pointer, and bursts apart on hover before springing
   back together. Neutral white pixels take the theme's ink colour.

   Exposes window.createVoxelLogo(canvas, options)
   ================================================================== */

window.createVoxelLogo = function createVoxelLogo(canvas, options) {
  const { root, animate, finePointer, hoverEl } = options;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const COLS = 66;
  let rows = 0;
  let voxels = [];
  let colors = {};
  let W = 0, H = 0, S = 1;
  let running = false, inView = false, rafId = 0, last = 0, t = 0;
  let rx = -0.35, ry = 0.15, trx = -0.35, tryaw = 0.15;
  let hovering = false, exploded = false;

  const readColors = () => {
    const s = getComputedStyle(root);
    colors = { ink: s.getPropertyValue('--ink').trim(), accent: s.getPropertyValue('--accent').trim() };
  };

  const hexToRgb = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  /* --- sample the PNG into voxels --- */
  const sample = (img) => {
    const off = document.createElement('canvas');
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const c = off.getContext('2d');
    c.drawImage(img, 0, 0);
    const { data } = c.getImageData(0, 0, off.width, off.height);
    const cell = off.width / COLS;
    rows = Math.round(off.height / cell);

    const at = (x, y) => { const i = (y * off.width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    const corners = [at(1, 1), at(off.width - 2, 1), at(1, off.height - 2), at(off.width - 2, off.height - 2)];
    const bg = [0, 1, 2].map((k) => corners.reduce((s, p) => s + p[k], 0) / 4);

    voxels = [];
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const x0 = Math.floor(gx * cell), x1 = Math.min(off.width, Math.floor((gx + 1) * cell));
        const y0 = Math.floor(gy * cell), y1 = Math.min(off.height, Math.floor((gy + 1) * cell));
        let count = 0, total = 0, best = -1, bestPx = null, bestSat = 0, bestLum = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            total++;
            const [r, g, b] = at(x, y);
            if (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) < 90) continue;
            count++;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const sat = max ? (max - min) / max : 0;
            const lum = max / 255;
            const score = sat * 1.5 + lum;
            if (score > best) { best = score; bestPx = [r, g, b]; bestSat = sat; bestLum = lum; }
          }
        }
        if (!bestPx || count / total < 0.1) continue;
        let color = null;
        if (bestSat > 0.3) color = bestPx;
        else if (bestLum < 0.75) continue;
        voxels.push({ gx, gy, color, ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, tz: 0 });
      }
    }
  };

  /* --- rendering --- */
  const FACES = [
    { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
  ];
  const LIGHT = (() => { const l = [-0.35, -0.6, 0.72]; const m = Math.hypot(...l); return l.map((v) => v / m); })();

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    if (!voxels.length) return;
    const wire = root.classList.contains('wireframe');
    const ink = hexToRgb(colors.ink);
    const cx = W / 2, cy = H / 2;
    const cosX = Math.cos(rx), sinX = Math.sin(rx), cosY = Math.cos(ry), sinY = Math.sin(ry);
    const rot = (x, y, z) => {
      const x1 = x * cosY + z * sinY, z1 = -x * sinY + z * cosY;
      return [x1, y * cosX - z1 * sinX, y * sinX + z1 * cosX];
    };

    const half = S * 0.46;
    const faces = FACES.map((f) => {
      const rn = rot(...f.n);
      const shade = 0.5 + 0.5 * Math.max(0, rn[0] * LIGHT[0] + rn[1] * LIGHT[1] + rn[2] * LIGHT[2]);
      const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [
        f.n[0] * half + f.u[0] * half * a + f.v[0] * half * b,
        f.n[1] * half + f.u[1] * half * a + f.v[1] * half * b,
        f.n[2] * half + f.u[2] * half * a + f.v[2] * half * b,
      ].map((v, k) => v));
      return { visible: rn[2] > 0.02, shade, rc: corners.map((c) => rot(...c)) };
    });

    const items = [];
    for (const v of voxels) {
      const wx = (v.gx - COLS / 2 + 0.5) * S + v.ox;
      const wy = (v.gy - rows / 2 + 0.5) * S + v.oy;
      const p = rot(wx, wy, v.oz);
      items.push({ v, x: p[0], y: p[1], z: p[2] });
    }
    items.sort((a, b) => a.z - b.z);

    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.accent;
    ctx.lineJoin = 'round';
    for (const it of items) {
      const base = it.v.color || ink;
      for (const f of faces) {
        if (!f.visible) continue;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const c = f.rc[k];
          const px = cx + it.x + c[0], py = cy + it.y + c[1];
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        if (wire) {
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgb(${(base[0] * f.shade) | 0},${(base[1] * f.shade) | 0},${(base[2] * f.shade) | 0})`;
          ctx.fill();
        }
      }
    }
  };

  const update = (dt) => {
    t += dt;
    if (!hovering) {
      tryaw = 0.15 + Math.sin(t * 0.35) * 0.22;
      trx = -0.35 + Math.cos(t * 0.27) * 0.1;
    }
    rx += (trx - rx) * 0.08;
    ry += (tryaw - ry) * 0.08;
    const k = 55, damp = 7.5;
    for (const v of voxels) {
      if (!exploded) v.tz = Math.sin(t * 1.6 + v.gx * 0.35 + v.gy * 0.2) * S * 0.25;
      v.vx += ((v.tx - v.ox) * k - v.vx * damp) * dt;
      v.vy += ((v.ty - v.oy) * k - v.vy * damp) * dt;
      v.vz += ((v.tz - v.oz) * k - v.vz * damp) * dt;
      v.ox += v.vx * dt;
      v.oy += v.vy * dt;
      v.oz += v.vz * dt;
    }
  };

  const frame = (now) => {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05) || 0.016;
    last = now;
    update(dt);
    draw();
    rafId = requestAnimationFrame(frame);
  };
  const start = () => {
    if (running || !animate || !inView || document.hidden) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  };
  const stop = () => { running = false; cancelAnimationFrame(rafId); };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The canvas is the 130%-tall parallax layer, so the sculpture is sized
    // to stay inside the visible frame while the layer scrolls ±12%.
    S = rows ? Math.min((W * 0.78) / COLS, (H * 0.44) / rows) : 1;
    if (!running) draw();
  };

  const explode = () => {
    exploded = true;
    for (const v of voxels) {
      v.tx = (Math.random() - 0.5) * S * 8;
      v.ty = (Math.random() - 0.5) * S * 6;
      v.tz = S * 2 + Math.random() * S * 8;
    }
  };
  const assemble = () => {
    exploded = false;
    for (const v of voxels) { v.tx = 0; v.ty = 0; v.tz = 0; }
  };

  readColors();
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => { sample(img); resize(); };
  img.onerror = () => console.warn('voxel logo: could not load', canvas.dataset.src);
  img.src = canvas.dataset.src;

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    inView ? start() : stop();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  new MutationObserver(() => { readColors(); if (!running) draw(); }).observe(root, { attributes: true, attributeFilter: ['class'] });

  if (animate && hoverEl) {
    if (finePointer) {
      hoverEl.addEventListener('mouseenter', () => { hovering = true; explode(); });
      hoverEl.addEventListener('mouseleave', () => { hovering = false; assemble(); });
      hoverEl.addEventListener('mousemove', (event) => {
        const r = hoverEl.getBoundingClientRect();
        const px = (event.clientX - r.left) / r.width - 0.5;
        const py = (event.clientY - r.top) / r.height - 0.5;
        tryaw = px * 1.1;
        trx = -0.35 - py * 0.7;
      });
    } else {
      // Touch: tap-and-hold bursts the sculpture; release reassembles.
      hoverEl.addEventListener('touchstart', () => { hovering = true; explode(); }, { passive: true });
      hoverEl.addEventListener('touchend', () => { hovering = false; assemble(); }, { passive: true });
    }
  }

  return { explode, assemble, count: () => voxels.length };
};

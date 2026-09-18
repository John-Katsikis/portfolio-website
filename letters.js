/* ==================================================================
   letters.js — rigid-body physics for the hero letters
   ------------------------------------------------------------------
   Each hero letter is a circle body. Grabbing one switches physics on
   for all of them: gravity pulls them onto the hairline under the
   title, they collide, roll and can be thrown. G toggles zero gravity,
   double-click or Escape tweens everything home.

   Exposes window.createLetterPhysics(letters, arenaEl, floorEl, opts)
   ================================================================== */

window.createLetterPhysics = function createLetterPhysics(letters, arenaEl, floorEl, options) {
  const { gsap, root, onActivate } = options;
  const GRAVITY = 1800;

  const bodies = [];
  let active = false;
  let gravity = GRAVITY;
  let grabbed = null;
  let grabOffset = { x: 0, y: 0 };
  let lastPointer = { x: 0, y: 0, t: 0 };
  let bounds = null;
  let rafId = 0;
  let last = 0;

  const measure = () => {
    const a = arenaEl.getBoundingClientRect();
    const f = floorEl.getBoundingClientRect();
    bounds = {
      left: a.left + 16,
      right: a.right - 16,
      top: a.top + window.scrollY + 90,
      floor: f.top + window.scrollY - 1,
    };
  };

  const render = () => {
    for (const b of bodies) {
      gsap.set(b.el, { x: b.x - b.hx, y: b.y - b.hy, rotation: (b.a * 180) / Math.PI });
    }
  };

  const integrate = (h) => {
    const rest = gravity ? 0.35 : 0.92;
    for (const b of bodies) {
      if (b === grabbed) {
        b.vx *= 0.85;
        b.vy *= 0.85;
        continue;
      }
      b.vy += gravity * h;
      b.vx *= 1 - 0.3 * h;
      b.vy *= 1 - 0.3 * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.a += b.av * h;
      b.av *= 1 - 0.5 * h;

      if (b.x - b.r < bounds.left) { b.x = bounds.left + b.r; b.vx = Math.abs(b.vx) * rest; b.av *= 0.8; }
      if (b.x + b.r > bounds.right) { b.x = bounds.right - b.r; b.vx = -Math.abs(b.vx) * rest; b.av *= 0.8; }
      if (b.y - b.r < bounds.top) { b.y = bounds.top + b.r; b.vy = Math.abs(b.vy) * rest; }
      if (b.y + b.r > bounds.floor) {
        b.y = bounds.floor - b.r;
        b.vy = -Math.abs(b.vy) * rest;
        if (Math.abs(b.vy) < 40) b.vy = 0;
        b.vx *= 1 - 2.5 * h;
        b.av += (b.vx / b.r - b.av) * 0.2;
      }
    }

    for (let i = 0; i < bodies.length; i++) {
      const bi = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const bj = bodies[j];
        const dx = bj.x - bi.x, dy = bj.y - bi.y;
        const dist = Math.hypot(dx, dy);
        const minD = bi.r + bj.r;
        if (dist <= 0 || dist >= minD) continue;
        const nx = dx / dist, ny = dy / dist;
        const wi = bi === grabbed ? 0 : 1;
        const wj = bj === grabbed ? 0 : 1;
        const total = wi + wj || 1;
        const overlap = minD - dist;
        bi.x -= (nx * overlap * wi) / total;
        bi.y -= (ny * overlap * wi) / total;
        bj.x += (nx * overlap * wj) / total;
        bj.y += (ny * overlap * wj) / total;

        const rvx = bj.vx - bi.vx, rvy = bj.vy - bi.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const impulse = (-(1 + 0.25) * vn) / total;
          bi.vx -= nx * impulse * wi;
          bi.vy -= ny * impulse * wi;
          bj.vx += nx * impulse * wj;
          bj.vy += ny * impulse * wj;
          const vt = rvx * -ny + rvy * nx;
          bi.av += (vt / bi.r) * 0.1 * wi;
          bj.av -= (vt / bj.r) * 0.1 * wj;
        }
      }
    }
  };

  const step = (now) => {
    if (!active) return;
    const dt = Math.min((now - last) / 1000, 1 / 30) || 1 / 60;
    last = now;
    const sub = 3;
    for (let s = 0; s < sub; s++) integrate(dt / sub);
    render();
    rafId = requestAnimationFrame(step);
  };

  const activate = () => {
    if (active) return;
    active = true;
    root.classList.add('letters-physics');
    gsap.killTweensOf(letters);
    gsap.set(letters, { yPercent: 0, scaleY: 1, x: 0, y: 0, rotation: 0 });
    measure();
    bodies.length = 0;
    for (const el of letters) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2 + window.scrollY;
      bodies.push({ el, hx: cx, hy: cy, x: cx, y: cy, vx: 0, vy: 0, a: 0, av: 0, r: Math.max(12, (r.width + r.height) * 0.24) });
    }
    onActivate?.();
    last = performance.now();
    rafId = requestAnimationFrame(step);
  };

  const reset = () => {
    if (!active) return;
    active = false;
    grabbed = null;
    gravity = GRAVITY;
    cancelAnimationFrame(rafId);
    root.classList.remove('letters-physics');
    gsap.to(letters, {
      x: 0, y: 0, rotation: 0,
      duration: 1.1,
      ease: 'elastic.out(1, 0.55)',
      stagger: { each: 0.02, from: 'random' },
    });
  };

  const toggleGravity = () => {
    if (!active) activate();
    gravity = gravity ? 0 : GRAVITY;
    if (!gravity) {
      for (const b of bodies) {
        b.vx += (Math.random() - 0.5) * 160;
        b.vy -= 60 + Math.random() * 120;
        b.av += (Math.random() - 0.5) * 2;
      }
    }
    return gravity === 0;
  };

  letters.forEach((el, i) => {
    el.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      activate();
      const b = bodies[i];
      grabbed = b;
      b.vx = 0;
      b.vy = 0;
      try { el.setPointerCapture(event.pointerId); } catch { /* not a live pointer; drag still works while over the letter */ }
      el.classList.add('is-dragging');
      const py = event.clientY + window.scrollY;
      grabOffset = { x: b.x - event.clientX, y: b.y - py };
      lastPointer = { x: event.clientX, y: py, t: performance.now() };
    });

    el.addEventListener('pointermove', (event) => {
      if (grabbed !== bodies[i]) return;
      const b = grabbed;
      const px = event.clientX, py = event.clientY + window.scrollY;
      const t = performance.now();
      const dt = Math.max((t - lastPointer.t) / 1000, 1 / 240);
      const nx = Math.min(Math.max(px + grabOffset.x, bounds.left + b.r), bounds.right - b.r);
      const ny = Math.min(Math.max(py + grabOffset.y, bounds.top + b.r), bounds.floor - b.r);
      b.vx = b.vx * 0.5 + ((nx - b.x) / dt) * 0.5;
      b.vy = b.vy * 0.5 + ((ny - b.y) / dt) * 0.5;
      b.x = nx;
      b.y = ny;
      lastPointer = { x: px, y: py, t };
    });

    const release = () => {
      if (grabbed !== bodies[i]) return;
      el.classList.remove('is-dragging');
      const b = grabbed;
      grabbed = null;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 3000) { b.vx *= 3000 / speed; b.vy *= 3000 / speed; }
      b.av = (b.vx / b.r) * 0.3;
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('dragstart', (event) => event.preventDefault());
  });

  arenaEl.addEventListener('dblclick', reset);
  window.addEventListener('resize', () => {
    if (!active) return;
    active = false;
    grabbed = null;
    cancelAnimationFrame(rafId);
    root.classList.remove('letters-physics');
    gsap.set(letters, { x: 0, y: 0, rotation: 0 });
  });

  return {
    activate,
    reset,
    toggleGravity,
    isActive: () => active,
    gravityOn: () => gravity > 0,
  };
};

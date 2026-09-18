/* ==================================================================
   script.js — theme, gimmicks and the GSAP animation controller
   ------------------------------------------------------------------
   Sections:
     1. Setup
     2. Theme switching (light ⇄ dark, persisted, circular wipe)
     3. Utilities (footer year, London/Athens clocks, tab title, console)
     4. Toast
     5. Procedural planet (canvas, seeded, pointer-reactive)
     6. Keyboard easter eggs (` stats, R reseed, Konami → wireframe)
     7. Motion (GSAP): mask reveal, springy letters, progress hairline,
        scroll parallax + curtain entrances, magnetic links
   ================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  /* ----------------------------------------------------------------
     1. SETUP
     ---------------------------------------------------------------- */
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const hasGsap = typeof gsap !== 'undefined';

  // style.css pre-hides animated elements under html.js; if GSAP never
  // arrived (CDN down) nothing would un-hide them, so drop the class.
  if (!hasGsap) root.classList.remove('js');

  /* ----------------------------------------------------------------
     2. THEME SWITCHING
     ----------------------------------------------------------------
     The <head> bootstrap already applied the saved theme before first
     paint. The toggle flips .dark on <html> and persists the choice.
     Where the View Transitions API exists, the new theme radiates out
     from the toggle as an expanding circle; otherwise the CSS
     .theme-fade cross-fade does the job.
     ---------------------------------------------------------------- */
  const themeToggle = document.getElementById('theme-toggle');

  const setTheme = (mode) => {
    root.classList.toggle('dark', mode === 'dark');
    localStorage.setItem('theme', mode);
  };

  themeToggle.addEventListener('click', () => {
    const next = root.classList.contains('dark') ? 'light' : 'dark';

    if (hasGsap && !reduceMotion) {
      gsap.fromTo('.theme-knob', { scale: 0.7 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' });
    }

    if (!document.startViewTransition || reduceMotion) {
      setTheme(next);
      return;
    }

    const bounds = themeToggle.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    root.classList.add('vt');
    const transition = document.startViewTransition(() => setTheme(next));
    transition.ready.then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 650,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    });
    transition.finished.finally(() => root.classList.remove('vt'));
  });

  // If the user never chose manually, follow live OS theme changes.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    if (!localStorage.getItem('theme')) root.classList.toggle('dark', event.matches);
  });

  /* ----------------------------------------------------------------
     3. UTILITIES
     ---------------------------------------------------------------- */
  document.getElementById('year').textContent = new Date().getFullYear();

  const clockLondon = document.getElementById('clock-london');
  const clockAthens = document.getElementById('clock-athens');
  const fmt = (tz) =>
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const tickClocks = () => {
    const now = new Date();
    clockLondon.textContent = `London ${fmt('Europe/London').format(now)}`;
    clockAthens.textContent = `Athens ${fmt('Europe/Athens').format(now)}`;
  };
  tickClocks();
  setInterval(tickClocks, 15000);

  const pageTitle = document.title;
  document.addEventListener('visibilitychange', () => {
    document.title = document.hidden ? '⏸ paused — Yiannis Katsikis' : pageTitle;
  });

  console.log(
    '%cYIANNI.%c graphics & games',
    'font: 800 32px "Big Shoulders Display", Impact, sans-serif; color: #2438e8; letter-spacing: .04em',
    'font: 12px "IBM Plex Mono", monospace; color: #888; margin-left: 8px'
  );
  console.log(
    '%c `  %c stats overlay\n%c R  %c regenerate the planet\n%c ↑↑↓↓←→←→BA %c wireframe mode',
    'font: 600 12px monospace; color: #2438e8', 'font: 12px monospace; color: #888',
    'font: 600 12px monospace; color: #2438e8', 'font: 12px monospace; color: #888',
    'font: 600 12px monospace; color: #2438e8', 'font: 12px monospace; color: #888'
  );

  /* ----------------------------------------------------------------
     4. TOAST
     ---------------------------------------------------------------- */
  const toast = document.getElementById('toast');
  let toastTimer;
  const showToast = (message, ms = 2400) => {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), ms);
  };

  /* ----------------------------------------------------------------
     5. PROCEDURAL PLANET
     ----------------------------------------------------------------
     A seeded wireframe globe behind the hero title. Land is decided by
     4-octave value noise sampled on a Fibonacci sphere, drawn as small
     squares (voxel-ish); oceans show only the graticule. The globe
     spins on its own, tilts and speeds up toward the pointer, and
     pauses when off-screen or when the tab is hidden.
     ---------------------------------------------------------------- */
  const globe = (() => {
    const canvas = document.getElementById('globe');
    const ctx = canvas.getContext('2d');
    const seedLabel = document.getElementById('seed-value');
    const POINTS = 1800;
    const animate = !reduceMotion;

    let seed = 0x8721;
    let land = [];
    let colors = {};
    let W = 0;
    let H = 0;
    let yaw = 0;
    let pitch = 0.35;
    let targetPitch = 0.35;
    let spinBoost = 0;
    let targetBoost = 0;
    let running = false;
    let inView = false;
    let rafId = 0;

    const readColors = () => {
      const s = getComputedStyle(root);
      colors = {
        ink: s.getPropertyValue('--ink').trim(),
        soft: s.getPropertyValue('--soft').trim(),
        accent: s.getPropertyValue('--accent').trim(),
      };
    };

    // --- seeded value noise ---
    const hash = (x, y, z, s) => {
      let h = (x * 374761393 + y * 668265263 + z * 1274126177 + s * 69069) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
    const smooth = (t) => t * t * (3 - 2 * t);
    const lerp = (a, b, t) => a + (b - a) * t;
    const noise = (x, y, z, s) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
      const c = (a, b, d) => hash(xi + a, yi + b, zi + d, s);
      return lerp(
        lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
        lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
        w
      );
    };
    const fbm = (x, y, z, s) => {
      let sum = 0, amp = 0.5, freq = 1;
      for (let o = 0; o < 4; o++) {
        sum += amp * noise(x * freq, y * freq, z * freq, s + o * 101);
        amp *= 0.5;
        freq *= 2.03;
      }
      return sum;
    };

    const build = () => {
      land = [];
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < POINTS; i++) {
        const y = 1 - (i / (POINTS - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const theta = golden * i;
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        const n = fbm(x * 2.1 + 13.7, y * 2.1 + 7.9, z * 2.1 + 3.3, seed);
        if (n < 0.5) continue;
        land.push({ x, y, z, hi: n > 0.575 });
      }
      seedLabel.textContent = seed.toString(16).toUpperCase().padStart(4, '0');
    };

    // Graticule as arrays of unit vectors, built once.
    const ring = (fn) => Array.from({ length: 73 }, (_, i) => fn((i / 72) * Math.PI * 2));
    const rings = [];
    for (const latDeg of [-60, -30, 0, 30, 60]) {
      const lat = (latDeg * Math.PI) / 180;
      rings.push(ring((t) => ({ x: Math.cos(lat) * Math.cos(t), y: Math.sin(lat), z: Math.cos(lat) * Math.sin(t) })));
    }
    for (const lonDeg of [0, 30, 60, 90, 120, 150]) {
      const lon = (lonDeg * Math.PI) / 180;
      rings.push(ring((t) => ({ x: Math.cos(t) * Math.cos(lon), y: Math.sin(t), z: Math.cos(t) * Math.sin(lon) })));
    }

    const rotate = (p) => {
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const x = p.x * cy + p.z * sy;
      const z0 = -p.x * sy + p.z * cy;
      return { x, y: p.y * cp - z0 * sp, z: p.y * sp + z0 * cp };
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const R = Math.min(W, H) * 0.42;
      const cx = W / 2;
      const cy = H / 2;
      const wire = root.classList.contains('wireframe');

      ctx.lineWidth = 1.25;
      ctx.strokeStyle = colors.ink;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.soft;
      for (const pts of rings) {
        const front = new Path2D();
        const back = new Path2D();
        let prev = null;
        for (const p of pts) {
          const q = rotate(p);
          const px = cx + q.x * R;
          const py = cy - q.y * R;
          if (prev) {
            const path = q.z > 0 && prev.z > 0 ? front : back;
            path.moveTo(prev.px, prev.py);
            path.lineTo(px, py);
          }
          prev = { px, py, z: q.z };
        }
        ctx.globalAlpha = wire ? 0.4 : 0.12;
        ctx.stroke(back);
        ctx.globalAlpha = 0.55;
        ctx.stroke(front);
      }

      for (const p of land) {
        const q = rotate(p);
        if (q.z < 0 && !wire) continue;
        ctx.globalAlpha = q.z < 0 ? 0.15 : 0.3 + 0.7 * q.z;
        ctx.fillStyle = p.hi ? colors.accent : colors.ink;
        const size = (p.hi ? 3.2 : 2.4) * (0.6 + 0.4 * Math.max(q.z, 0));
        ctx.fillRect(cx + q.x * R - size / 2, cy - q.y * R - size / 2, size, size);
      }

      // Orbiting satellite, echoing the accent dot on the project cover.
      const orbit = yaw * 1.6;
      const sx = cx + Math.cos(orbit) * R * 1.18;
      const sy = cy - Math.sin(orbit) * R * 0.32 - R * 0.2;
      ctx.globalAlpha = Math.sin(orbit) < 0 ? 0.95 : 0.35;
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
    };

    const tick = () => {
      if (!running) return;
      spinBoost += (targetBoost - spinBoost) * 0.04;
      pitch += (targetPitch - pitch) * 0.05;
      yaw += 0.0035 + spinBoost;
      draw();
      rafId = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running || !animate || !inView || document.hidden) return;
      running = true;
      rafId = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(rafId);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const reseed = () => {
      seed = (Math.random() * 0xffff) | 0;
      build();
      if (!running) draw();
      showToast(`planet regenerated · seed 0x${seedLabel.textContent}`);
    };

    readColors();
    build();
    new ResizeObserver(resize).observe(canvas);

    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      inView ? start() : stop();
    }).observe(canvas);

    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    // Theme or wireframe class flips → new palette, redraw if idle.
    new MutationObserver(() => {
      readColors();
      if (!running) draw();
    }).observe(root, { attributes: true, attributeFilter: ['class'] });

    if (finePointer) {
      window.addEventListener('mousemove', (event) => {
        const nx = event.clientX / window.innerWidth - 0.5;
        const ny = event.clientY / window.innerHeight - 0.5;
        targetBoost = nx * 0.012;
        targetPitch = 0.35 + ny * 0.8;
      });
    }

    document.getElementById('seed-btn').addEventListener('click', reseed);

    return { reseed, canvas, seedHex: () => seedLabel.textContent };
  })();

  /* ----------------------------------------------------------------
     6. KEYBOARD EASTER EGGS
     ---------------------------------------------------------------- */
  const stats = document.getElementById('stats');
  const statsBody = document.getElementById('stats-body');
  let statsOn = false;
  let fps = 60;
  let lastFrame = performance.now();

  const statsLoop = (now) => {
    if (!statsOn) return;
    const dt = now - lastFrame;
    lastFrame = now;
    fps += (1000 / Math.max(dt, 1) - fps) * 0.1;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const pct = maxScroll > 0 ? Math.round((window.scrollY / maxScroll) * 100) : 0;
    statsBody.textContent =
      `fps    ${String(Math.round(fps)).padStart(3)}\n` +
      `frame  ${dt.toFixed(1)} ms\n` +
      `scroll ${String(pct).padStart(3)} %\n` +
      `view   ${window.innerWidth}×${window.innerHeight} @${(window.devicePixelRatio || 1).toFixed(1)}x\n` +
      `theme  ${root.classList.contains('dark') ? 'dark' : 'light'}\n` +
      `seed   0x${globe.seedHex()}\n` +
      `mode   ${root.classList.contains('wireframe') ? 'wireframe' : 'solid'}`;
    requestAnimationFrame(statsLoop);
  };

  const toggleStats = () => {
    statsOn = !statsOn;
    stats.hidden = !statsOn;
    if (statsOn) {
      lastFrame = performance.now();
      requestAnimationFrame(statsLoop);
    }
  };

  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let keyBuffer = [];

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

    keyBuffer = [...keyBuffer, key].slice(-KONAMI.length);
    if (keyBuffer.join() === KONAMI.join()) {
      keyBuffer = [];
      const on = root.classList.toggle('wireframe');
      showToast(on ? 'wireframe mode · glPolygonMode(GL_LINE)' : 'solid mode · glPolygonMode(GL_FILL)');
    }

    if (key === '`') toggleStats();
    if (key === 'r') globe.reseed();
  });

  /* ----------------------------------------------------------------
     7. MOTION
     ----------------------------------------------------------------
     Everything below needs GSAP and a user who is fine with motion.
     With reduced motion the page is fully styled and readable as-is
     (style.css only pre-hides elements when motion is allowed).
     ---------------------------------------------------------------- */
  if (!hasGsap || reduceMotion) return;

  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: 'power3.out', duration: 1 });

  /* (a) Split the hero words into letters so each can spring on hover.
     Done before the reveal so there is no layout shift mid-tween. */
  document.querySelectorAll('.hero-word').forEach((word) => {
    const text = word.textContent;
    word.textContent = '';
    for (const ch of text) {
      const span = document.createElement('span');
      span.className = 'letter';
      span.textContent = ch === ' ' ? ' ' : ch;
      word.appendChild(span);
    }
  });

  if (finePointer) {
    document.querySelectorAll('.letter').forEach((letter) => {
      letter.addEventListener('mouseenter', () => {
        gsap.killTweensOf(letter);
        gsap
          .timeline()
          .to(letter, {
            yPercent: -16,
            rotation: gsap.utils.random(-7, 7),
            scaleY: 1.08,
            duration: 0.16,
            ease: 'power2.out',
          })
          .to(letter, {
            yPercent: 0,
            rotation: 0,
            scaleY: 1,
            duration: 1,
            ease: 'elastic.out(1, 0.35)',
          });
      });
    });
  }

  /* (b) Typography mask reveal — each .reveal-text slides up out of
     its overflow-hidden .reveal-line, staggered top-to-bottom. */
  // y: 0 is explicit because GSAP would otherwise keep the CSS pre-hide
  // translateY(110%) around as a pixel offset.
  gsap.fromTo(
    '.reveal-text',
    { yPercent: 110, y: 0 },
    {
      yPercent: 0,
      y: 0,
      duration: 1.1,
      ease: 'power4.out',
      stagger: 0.09,
      delay: 0.15,
      onComplete: () =>
        document.querySelectorAll('.reveal-line').forEach((line) => line.classList.add('is-revealed')),
    }
  );

  /* (c) Scroll progress hairline along the top edge. */
  gsap.to('#scroll-progress', {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0.25 },
  });

  /* (d) The planet drifts down and fades as the hero scrolls away. */
  gsap.to(globe.canvas, {
    yPercent: 35,
    autoAlpha: 0,
    ease: 'none',
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true },
  });

  /* (e) Portfolio grid — per card: scrubbed parallax + Ken Burns on the
     visual (the inner layer is 130% tall so ±12% never shows an edge),
     then a one-shot curtain-lift entrance followed by the text. */
  gsap.utils.toArray('.work-item').forEach((item) => {
    const visual = item.querySelector('.parallax-inner');
    const frame = item.querySelector('.work-visual');
    if (!visual || !frame) return;
    const meta = item.querySelectorAll(':scope a > :not(.work-visual)');

    gsap.fromTo(
      visual,
      { yPercent: -12, scale: 1.12 },
      {
        yPercent: 12,
        scale: 1,
        ease: 'none',
        scrollTrigger: { trigger: item, start: 'top bottom', end: 'bottom top', scrub: true },
      }
    );

    gsap.set(frame, { clipPath: 'inset(100% 0 0 0)' });
    gsap.set(meta, { y: 32, autoAlpha: 0 });

    gsap
      .timeline({ scrollTrigger: { trigger: item, start: 'top 85%', once: true } })
      .to(frame, { clipPath: 'inset(0% 0 0 0)', duration: 1.1, ease: 'power4.out' })
      .to(meta, { y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.08 }, '-=0.55');
  });

  /* (f) Magnetic hover — the .magnetic-target leans toward the pointer
     while it is inside .magnetic-area, then snaps home elastically. */
  if (finePointer) {
    document.querySelectorAll('.magnetic-area').forEach((area) => {
      const target = area.querySelector('.magnetic-target');
      if (!target) return;

      const xTo = gsap.quickTo(target, 'x', { duration: 0.4, ease: 'power3.out' });
      const yTo = gsap.quickTo(target, 'y', { duration: 0.4, ease: 'power3.out' });

      area.addEventListener('mousemove', (event) => {
        const bounds = area.getBoundingClientRect();
        xTo((event.clientX - (bounds.left + bounds.width / 2)) * 0.3);
        yTo((event.clientY - (bounds.top + bounds.height / 2)) * 0.3);
      });

      area.addEventListener('mouseleave', () => {
        gsap.to(target, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
      });
    });
  }

  // Web fonts change text metrics after load — re-measure triggers.
  window.addEventListener('load', () => ScrollTrigger.refresh());
});

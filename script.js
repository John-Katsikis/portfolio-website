/* ==================================================================
   script.js — theme, gimmicks and the GSAP animation controller
   ------------------------------------------------------------------
   Sections:
     1. Setup
     2. Theme switching (London-sun auto theme, manual toggle, wipe)
     3. Utilities (footer year, London/Athens clocks, tab title, console)
     4. Toast
     5. Procedural planet (planet.js) + real solar position
     6. Voxel Panda logo (voxel.js)
     7. Keyboard easter eggs (` stats, R reseed, G gravity, Konami)
     8. Motion (GSAP): mask reveal, letter physics + springs, progress
        hairline, scroll parallax + curtain entrances, magnetic links
   ================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  /* ----------------------------------------------------------------
     1. SETUP
     ---------------------------------------------------------------- */
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const hasGsap = typeof gsap !== 'undefined';
  const LONDON = { lat: 51.5074, lon: -0.1278 };
  const DUSK = (-6 * Math.PI) / 180; // civil twilight

  // style.css pre-hides animated elements under html.js; if GSAP never
  // arrived (CDN down) nothing would un-hide them, so drop the class.
  if (!hasGsap) root.classList.remove('js');

  /* ----------------------------------------------------------------
     2. THEME SWITCHING
     ----------------------------------------------------------------
     With no saved choice the theme follows the real sun over London
     (bootstrap in <head> did this before first paint; here it is
     re-checked every minute). Using the toggle saves a manual choice.
     Where the View Transitions API exists the new theme radiates out
     from the toggle as an expanding circle.
     ---------------------------------------------------------------- */
  const themeToggle = document.getElementById('theme-toggle');
  const sunNow = () => window.sunPosition(new Date(), LONDON.lat, LONDON.lon);
  const themeIsAuto = () => !localStorage.getItem('theme');

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
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    root.classList.add('vt');
    const transition = document.startViewTransition(() => setTheme(next));
    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    });
    transition.finished.finally(() => root.classList.remove('vt'));
  });

  /* ----------------------------------------------------------------
     3. UTILITIES
     ---------------------------------------------------------------- */
  document.getElementById('year').textContent = new Date().getFullYear();

  const clockLondon = document.getElementById('clock-london');
  const clockAthens = document.getElementById('clock-athens');
  const fmt = (tz) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
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

  const kbd = 'font: 600 12px monospace; color: #2438e8';
  const txt = 'font: 12px monospace; color: #888';
  console.log(
    '%cYIANNI.%c graphics & games',
    'font: 800 32px "Big Shoulders Display", Impact, sans-serif; color: #2438e8; letter-spacing: .04em',
    'font: 12px "IBM Plex Mono", monospace; color: #888; margin-left: 8px'
  );
  console.log(
    '%c grab a letter %c drag & throw the title\n%c G  %c zero gravity\n%c R  %c regenerate the planet\n%c `  %c stats overlay\n%c ↑↑↓↓←→←→BA %c wireframe mode\n%c theme %c follows the London sun until you use the toggle — localStorage.removeItem("theme") goes back to auto\n%c planet %c window.planet — try planet.setSun([0, 0, -1]) for midnight',
    kbd, txt, kbd, txt, kbd, txt, kbd, txt, kbd, txt, kbd, txt, kbd, txt
  );

  /* ----------------------------------------------------------------
     4. TOAST
     ---------------------------------------------------------------- */
  const toast = document.getElementById('toast');
  let toastTimer;
  const showToast = (message, ms = 2600) => {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), ms);
  };

  /* ----------------------------------------------------------------
     5. PROCEDURAL PLANET + REAL SUN
     ----------------------------------------------------------------
     The disc centre is "London": the camera sits over it, so the
     sun's real elevation and azimuth there decide where the
     terminator falls. Noon = fully lit; midnight = dark side with
     city lights. Re-evaluated every minute along with the auto theme.
     ---------------------------------------------------------------- */
  const globe = window.createPlanet(document.getElementById('globe'), {
    root,
    animate: !reduceMotion,
    finePointer,
    seedLabel: document.getElementById('seed-value'),
    onReseed: (hex) => showToast(`planet regenerated · seed 0x${hex}`),
  });
  document.getElementById('seed-btn').addEventListener('click', globe.reseed);
  window.planet = globe; // console playground: planet.reseed(), planet.setSun([x, y, z])

  let sun = sunNow();
  const applySun = () => {
    sun = sunNow();
    const { elevation: el, azimuth: az } = sun;
    // x east, y north (up on screen), z toward the camera (London's zenith)
    globe.setSun([Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el)]);
    if (themeIsAuto()) root.classList.toggle('dark', el < DUSK);
  };
  applySun();
  setInterval(applySun, 60000);

  /* ----------------------------------------------------------------
     6. VOXEL PANDA
     ---------------------------------------------------------------- */
  const pandaCanvas = document.getElementById('panda-voxels');
  const panda = pandaCanvas
    ? window.createVoxelLogo(pandaCanvas, {
        root,
        animate: !reduceMotion,
        finePointer,
        hoverEl: pandaCanvas.closest('.work-item'),
      })
    : null;

  /* ----------------------------------------------------------------
     7. KEYBOARD EASTER EGGS
     ---------------------------------------------------------------- */
  const stats = document.getElementById('stats');
  const statsBody = document.getElementById('stats-body');
  let statsOn = false;
  let fps = 60;
  let lastFrame = performance.now();
  let physics = null; // set in section 8

  const deg = (r) => `${Math.round((r * 180) / Math.PI)}°`;
  const statsLoop = (now) => {
    if (!statsOn) return;
    const dt = now - lastFrame;
    lastFrame = now;
    fps += (1000 / Math.max(dt, 1) - fps) * 0.1;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const pct = maxScroll > 0 ? Math.round((window.scrollY / maxScroll) * 100) : 0;
    const dark = root.classList.contains('dark');
    statsBody.textContent =
      `fps     ${String(Math.round(fps)).padStart(3)}\n` +
      `frame   ${dt.toFixed(1)} ms\n` +
      `scroll  ${String(pct).padStart(3)} %\n` +
      `view    ${window.innerWidth}×${window.innerHeight} @${(window.devicePixelRatio || 1).toFixed(1)}x\n` +
      `render  ${globe.mode}${globe.mode === 'webgl' ? ` ${globe.quality.toFixed(2)}x` : ''}\n` +
      `voxels  ${panda ? panda.count() : 0}\n` +
      `sun     el ${deg(sun.elevation)} az ${deg(sun.azimuth)} (london)\n` +
      `theme   ${dark ? 'dark' : 'light'} · ${themeIsAuto() ? 'auto' : 'manual'}\n` +
      `seed    0x${globe.seedHex()}\n` +
      `mode    ${root.classList.contains('wireframe') ? 'wireframe' : 'solid'}\n` +
      `gravity ${physics?.isActive() ? (physics.gravityOn() ? 'on' : 'zero-g') : 'static'}`;
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
    if (key === 'g' && physics) {
      const zeroG = physics.toggleGravity();
      showToast(zeroG ? 'gravity off · letters adrift' : 'gravity on · 9.81 m/s²');
    }
    if (key === 'Escape' && physics?.isActive()) physics.reset();
  });

  /* ----------------------------------------------------------------
     8. MOTION
     ----------------------------------------------------------------
     Everything below needs GSAP and a user who is fine with motion.
     With reduced motion the page is fully styled and readable as-is
     (style.css only pre-hides elements when motion is allowed).
     ---------------------------------------------------------------- */
  if (!hasGsap || reduceMotion) return;

  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: 'power3.out', duration: 1 });

  /* (a) Split the hero words into letters so each can spring on hover
     and later become a physics body. Done before the reveal so there
     is no layout shift mid-tween. */
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
  const letters = Array.from(document.querySelectorAll('.letter'));

  if (finePointer) {
    physics = window.createLetterPhysics(letters, document.getElementById('hero'), document.getElementById('hero-meta'), {
      gsap,
      root,
      onActivate: () => showToast('physics on · throw them · G zero-g · double-click to reset', 3600),
    });

    letters.forEach((letter) => {
      letter.addEventListener('mouseenter', () => {
        if (physics.isActive()) return;
        gsap.killTweensOf(letter);
        gsap
          .timeline()
          .to(letter, { yPercent: -16, rotation: gsap.utils.random(-7, 7), scaleY: 1.08, duration: 0.16, ease: 'power2.out' })
          .to(letter, { yPercent: 0, rotation: 0, scaleY: 1, duration: 1, ease: 'elastic.out(1, 0.35)' });
      });
    });
  }

  /* (b) Typography mask reveal — each .reveal-text slides up out of
     its overflow-hidden .reveal-line, staggered top-to-bottom.
     y: 0 is explicit because GSAP would otherwise keep the CSS
     pre-hide translateY(110%) around as a pixel offset. */
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
      onComplete: () => document.querySelectorAll('.reveal-line').forEach((line) => line.classList.add('is-revealed')),
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
      { yPercent: 12, scale: 1, ease: 'none', scrollTrigger: { trigger: item, start: 'top bottom', end: 'bottom top', scrub: true } }
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

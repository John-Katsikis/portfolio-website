/* ==================================================================
   script.js — the GSAP animation controller
   ------------------------------------------------------------------
   Sections:
     1. Setup & reduced-motion guard
     2. Theme switching (light ⇄ dark, persisted)
     3. Typography mask reveal on page load
     4. Staggered scroll parallax for the portfolio grid
     5. Magnetic hover for contact links
     6. Small utilities (footer year)
   ================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  /* ----------------------------------------------------------------
     1. SETUP
     ---------------------------------------------------------------- */
  gsap.registerPlugin(ScrollTrigger);

  // House defaults: one ease, one duration, used everywhere unless
  // a tween overrides them.
  gsap.defaults({ ease: 'power3.out', duration: 1 });

  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  /* ----------------------------------------------------------------
     2. THEME SWITCHING
     ----------------------------------------------------------------
     The <head> bootstrap script already applied the saved theme
     before first paint. This section only handles the toggle button:
       - flips the .dark class on <html>
       - persists the choice to localStorage
     The cross-fade itself is pure CSS (.theme-fade transitions), so
     it stays smooth even while GSAP is busy elsewhere.
     ---------------------------------------------------------------- */
  const themeToggle = document.getElementById('theme-toggle');

  const setTheme = (mode) => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
    localStorage.setItem('theme', mode);
  };

  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'light' : 'dark');

    // A tiny confirmation squash on the knob — skipped for
    // reduced-motion users.
    if (!prefersReducedMotion) {
      gsap.fromTo(
        '.theme-knob',
        { scale: 0.7 },
        { scale: 1, duration: 0.4, ease: 'back.out(3)' }
      );
    }
  });

  // If the user never chose manually, follow live OS theme changes.
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (event) => {
      if (!localStorage.getItem('theme')) {
        document.documentElement.classList.toggle('dark', event.matches);
      }
    });

  /* ----------------------------------------------------------------
     Everything below is motion. If the user prefers reduced motion,
     we stop here: the page is fully styled and readable without any
     animation (all reveals use .from(), so the resting state is the
     final state).
     ---------------------------------------------------------------- */
  if (prefersReducedMotion) {
    document.getElementById('year').textContent = new Date().getFullYear();
    return;
  }

  /* ----------------------------------------------------------------
     3. TYPOGRAPHY MASK REVEAL — page load
     ----------------------------------------------------------------
     Each .reveal-line is an overflow-hidden window (see style.css);
     the .reveal-text inside slides up out of it. Lines are staggered
     top-to-bottom for one orchestrated entrance.
     ---------------------------------------------------------------- */
  gsap.from('.reveal-text', {
    yPercent: 110,
    duration: 1.1,
    ease: 'power4.out',
    stagger: 0.09,
    delay: 0.15,
  });

  /* ----------------------------------------------------------------
     4. STAGGERED SCROLL PARALLAX — portfolio grid
     ----------------------------------------------------------------
     Each .work-item owns a .parallax-inner visual layer that is 120%
     tall (style.css). While the card crosses the viewport, the inner
     layer travels from -10% to +10% — sliding slightly faster than
     the text around it. scrub: true ties it directly to the
     scrollbar for that heavy, physical feel.
     ---------------------------------------------------------------- */
  gsap.utils.toArray('.work-item').forEach((item) => {
    const visual = item.querySelector('.parallax-inner');
    const frame = item.querySelector('.work-visual');
    if (!visual || !frame) return;

    // The text block under the visual (title row, description, tags).
    const meta = item.querySelectorAll(':scope a > :not(.work-visual)');

    /* (a) Cinematic scrub — while the card crosses the viewport, the
       visual drifts vertically AND settles out of a gentle Ken Burns
       zoom. Tied directly to the scrollbar (scrub: true) for that
       heavy, physical feel. The inner layer is 130% tall (style.css /
       index.html), so ±12% of travel never exposes an empty edge. */
    gsap.fromTo(
      visual,
      { yPercent: -12, scale: 1.12 },
      {
        yPercent: 12,
        scale: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: item,
          start: 'top bottom', // when the card enters the viewport
          end: 'bottom top',   // until it leaves
          scrub: true,
        },
      }
    );

    /* (b) Curtain-lift entrance — the frame un-clips from the bottom
       up, then the text underneath follows with a soft stagger.
       Initial states are set immediately so nothing flashes visible
       before its reveal. Plays once per card. */
    gsap.set(frame, { clipPath: 'inset(100% 0 0 0)' });
    gsap.set(meta, { y: 32, autoAlpha: 0 });

    const entrance = gsap.timeline({
      scrollTrigger: {
        trigger: item,
        start: 'top 85%',
        once: true,
      },
    });

    entrance
      .to(frame, {
        clipPath: 'inset(0% 0 0 0)',
        duration: 1.1,
        ease: 'power4.out',
      })
      .to(
        meta,
        { y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.08 },
        '-=0.55' // text starts while the curtain is still lifting
      );
  });

  /* ----------------------------------------------------------------
     5. MAGNETIC HOVER — contact links
     ----------------------------------------------------------------
     While the pointer is inside a .magnetic-area, the .magnetic-target
     leans toward it (30% of the pointer's offset from center). On
     leave it snaps home with an elastic ease. quickTo() is used so
     rapid mousemove events stay cheap.
     Magnetism only makes sense with a precise pointer, so touch
     devices are skipped entirely.
     ---------------------------------------------------------------- */
  if (window.matchMedia('(pointer: fine)').matches) {
    document.querySelectorAll('.magnetic-area').forEach((area) => {
      const target = area.querySelector('.magnetic-target');
      if (!target) return;

      const xTo = gsap.quickTo(target, 'x', { duration: 0.4, ease: 'power3.out' });
      const yTo = gsap.quickTo(target, 'y', { duration: 0.4, ease: 'power3.out' });

      area.addEventListener('mousemove', (event) => {
        const bounds = area.getBoundingClientRect();
        const relX = event.clientX - (bounds.left + bounds.width / 2);
        const relY = event.clientY - (bounds.top + bounds.height / 2);
        xTo(relX * 0.3);
        yTo(relY * 0.3);
      });

      area.addEventListener('mouseleave', () => {
        gsap.to(target, {
          x: 0,
          y: 0,
          duration: 0.7,
          ease: 'elastic.out(1, 0.4)',
        });
      });
    });
  }

  /* ----------------------------------------------------------------
     6. SMALL UTILITIES
     ---------------------------------------------------------------- */
  document.getElementById('year').textContent = new Date().getFullYear();

  // Web fonts change text metrics after load — re-measure triggers.
  window.addEventListener('load', () => ScrollTrigger.refresh());
});

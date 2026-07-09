# Yianni — Portfolio (Static Edition)

An ultra-clean, editorial single-page portfolio built with plain **HTML**, **Tailwind CSS (CDN)** and **GSAP + ScrollTrigger**, deployed automatically to **GitHub Pages**. No build step, no node_modules — edit a file, push, and it's live.

---

## 1. What's in the box

```
.
├── index.html                    # all content and page structure
├── style.css                     # theme variables, mask reveal, scrollbar
├── script.js                     # GSAP controller: theme, reveal, parallax, magnetic
├── .github/
│   └── workflows/
│       └── deploy.yml            # auto-deploy to GitHub Pages on push
└── README.md
```

How the three files divide the work:

| File | Owns |
|---|---|
| `index.html` | Content, layout (Tailwind classes), the theme toggle button |
| `style.css` | **All colors** (as CSS variables), the light↔dark cross-fade, the reveal-mask scaffolding, scrollbar |
| `script.js` | **All motion** and the theme-switching logic |

---

## 2. Deploying to GitHub Pages (first time, ~3 minutes)

1. **Create a repository** on GitHub. Two naming options:
   - `your-username.github.io` → site lives at `https://your-username.github.io/`
   - any other name (e.g. `portfolio`) → site lives at `https://your-username.github.io/portfolio/`

   Either works — this site uses only relative paths (`style.css`, `script.js`), so no configuration changes are needed for subpaths.

2. **Push these files** to the `main` branch:

   ```bash
   git init
   git add .
   git commit -m "Initial portfolio"
   git branch -M main
   git remote add origin https://github.com/your-username/portfolio.git
   git push -u origin main
   ```

3. **Enable Pages via Actions** (one-time): in the repo, go to
   **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

4. Done. The workflow in `.github/workflows/deploy.yml` runs on every push to `main`. Watch it under the **Actions** tab; the finished run shows your live URL. You can also re-deploy manually from that tab (**Run workflow**) thanks to `workflow_dispatch`.

### Before you publish — personalize these

Search `index.html` for `your-username`, `your-handle` and `hello@example.com` and replace them with your real GitHub, LinkedIn and email. Project links currently point at a placeholder GitHub URL — point each card's `<a href="...">` at the real repo or demo.

---

## 3. Light / Dark mode — how it works and how to restyle it

### How it works

- Every color on the site is a CSS variable defined once in `style.css`:
  `--paper`, `--ink`, `--soft`, `--line`, `--accent`.
- Tailwind utilities like `bg-paper` and `text-ink` are mapped to those variables in the inline `tailwind.config` block in `index.html`.
- Clicking the toggle makes `script.js` add/remove the `dark` class on `<html>` and save the choice to `localStorage`. The `html.dark { ... }` block in `style.css` swaps every variable at once, and the `.theme-fade` transition cross-fades the whole page over 0.5s.
- A tiny script in `<head>` applies the saved theme **before first paint**, so the page never flashes the wrong theme on reload.
- Users who never touch the toggle automatically follow their operating system's theme.

### Changing the palettes

Open `style.css` and edit the two variable blocks:

```css
:root {            /* LIGHT mode */
  --paper: #f4f4f0;
  --ink: #131311;
  --accent: #2438e8;   /* try a different accent here */
  ...
}

html.dark {        /* DARK mode */
  --paper: #0d0e10;
  --ink: #ecede8;
  --accent: #7681ff;
  ...
}
```

That's the entire theming system — you never need to hunt through HTML classes to recolor the site.

### Forcing a default theme

Want the site to open dark for everyone regardless of OS setting? In `index.html`, change the bootstrap script's condition to always add the class:

```js
document.documentElement.classList.add('dark');
```

---

## 4. Editing the project showcase grid

The grid lives in `index.html` inside `<section id="work">`. It is two `<div>` columns (**Column A** and **Column B**); the right column carries `md:mt-32`, which pushes it down and creates the staggered, editorial rhythm.

### Adding a project

1. Copy any complete `<article class="work-item"> ... </article>` block.
2. Paste it at the bottom of whichever column is shorter (alternate A → B → A → B to keep the stagger balanced).
3. Edit the title, year, description, tag line, and the `href`.
4. Update the small "05 projects" counter near the section heading.

Nothing else is required — parallax and the entrance animation attach automatically, because `script.js` finds every `.work-item` on the page with `gsap.utils.toArray('.work-item')` and wires each one up in a loop.

**About the artwork:** each card currently uses a small inline SVG line-drawing instead of a photo. To use a real screenshot instead, replace the `<svg> ... </svg>` inside `.parallax-inner` with:

```html
<img src="images/my-project.jpg" alt="My project screenshot"
     class="h-full w-full object-cover" />
```

Keep it *inside* `.parallax-inner` — that layer is 130% tall and is the thing GSAP slides for the parallax effect.

### Removing a project

Delete its whole `<article>` block and update the counter. If one column ends up much longer than the other, move a project across to rebalance.

### Changing the number of columns

The grid's column count is one class on the grid container:

```html
<div class="grid grid-cols-1 gap-x-10 gap-y-20 md:grid-cols-2">
```

- **Three columns:** change `md:grid-cols-2` → `lg:grid-cols-3`, add a third column `<div class="flex flex-col gap-20 lg:mt-16">`, and redistribute the articles. Vary each column's `mt-*` (e.g. `0` / `mt-32` / `mt-16`) to keep the stagger.
- **One column (a vertical feed):** delete the two inner column `<div>`s, place all `<article>`s directly inside the grid container, and remove `md:grid-cols-2`.

The animations keep working in every arrangement — they're attached per-card, not per-layout.

---

## 5. The animation system (`script.js`)

Six clearly labelled sections, in execution order:

1. **Setup** — registers ScrollTrigger and sets house defaults (`power3.out`, 1s) so every tween shares one motion language.
2. **Theme switching** — the toggle logic described above.
3. **Mask reveal** — every `.reveal-text` slides up out of its overflow-hidden `.reveal-line` parent, staggered. To give *any* new text this entrance, just wrap it in the same two spans:
   ```html
   <p class="reveal-line"><span class="reveal-text">New line</span></p>
   ```
4. **Cinematic scroll treatment** — two layers per card:
   - *Parallax + Ken Burns:* `.parallax-inner` travels from `-12%` to `+12%` while settling from `scale: 1.12` to `1` as the card crosses the viewport (`scrub: true` ties it to the scrollbar). Tune intensity via those `yPercent` and `scale` numbers — if you push `yPercent` past ~14, also grow the layer height (`h-[130%]` in `index.html`) to keep edges hidden.
   - *Curtain-lift entrance:* the visual frame un-clips from bottom to top (`clip-path: inset`), then the title, description and tags follow with a stagger. Plays once per card on first approach.
5. **Magnetic links** — anything structured as
   ```html
   <div class="magnetic-area"><a class="magnetic-target" href="...">Label</a></div>
   ```
   becomes magnetic automatically. The pull strength is the `0.3` multiplier.
6. **Utilities** — the auto-updating footer year and a `ScrollTrigger.refresh()` after fonts load.

**Accessibility built in:** if a visitor has *reduce motion* enabled in their OS, sections 3–5 never run and the page renders in its final, fully readable state (CSS has a matching safety net). The custom animations are also skipped on touch devices where they don't make sense (magnetism).

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Site 404s after first push | Confirm **Settings → Pages → Source = GitHub Actions**, and that the workflow under **Actions** finished green. |
| Styles look unstyled locally | You opened `index.html` via `file://` with no internet — Tailwind and GSAP load from CDNs, so you need a connection. For local work, `python3 -m http.server` in the folder and open `http://localhost:8000`. |
| Theme flashes on reload | Make sure the small bootstrap `<script>` is still the *first* script in `<head>`, before the CSS. |
| Parallax jumps after load | Fonts changed the layout — the `load` listener calls `ScrollTrigger.refresh()`; make sure section 6 of `script.js` is intact. |
| Cards animate but don't parallax | The card is missing its `.parallax-inner` wrapper — the visual must sit inside it. |

### A note on the Tailwind CDN

The Play CDN is perfect for a personal site like this: zero tooling, instant edits. Tailwind officially recommends a build step for large production apps (smaller CSS, no runtime), so if this site ever grows into one, the upgrade path is the Vite + Tailwind version of this portfolio — the design system (CSS variables) transfers over unchanged.

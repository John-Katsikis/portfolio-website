/* ==================================================================
   planet.js — the procedural planet in the hero
   ------------------------------------------------------------------
   Renders a seeded planet on the #globe canvas. Preferred path is a
   WebGL fragment shader (analytic sphere, fbm terrain with bump-lit
   relief, accent coastlines, ocean specular, clouds, atmosphere,
   day/night terminator with city lights). If WebGL is unavailable the
   same planet is drawn as a 2D wireframe globe instead.

   Exposes window.createPlanet(canvas, options) → api
   ================================================================== */

window.createPlanet = function createPlanet(canvas, options) {
  const { root, animate, finePointer, seedLabel, onReseed } = options;

  const state = {
    seed: 0x8721,
    yaw: 0,
    pitch: 0.35,
    targetPitch: 0.35,
    spinBoost: 0,
    targetBoost: 0,
    sun: [0.35, 0.3, 0.89],
    colors: {},
    wire: false,
    time: 0,
    quality: 0.7,
  };

  const readColors = () => {
    const s = getComputedStyle(root);
    const v = (name) => s.getPropertyValue(name).trim();
    state.colors = { ink: v('--ink'), soft: v('--soft'), accent: v('--accent'), paper: v('--paper') };
    state.dark = root.classList.contains('dark');
  };

  const hexToRgb = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  /* ----------------------------------------------------------------
     WebGL renderer
     ---------------------------------------------------------------- */
  const VERT = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() { v_uv = a_pos; gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;
    varying vec2 v_uv;
    uniform vec2 u_res;
    uniform float u_time, u_seed, u_yaw, u_pitch, u_wire, u_dark;
    uniform vec3 u_sun, u_ink, u_soft, u_accent, u_paper;

    const float R = 0.78;
    const float SEA = 0.52;
    const float PI = 3.14159265;

    float hash(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.zyx + 31.32);
      return fract((p.x + p.y) * p.z);
    }
    float noise(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
        f.z);
    }
    float fbm(vec3 p) {
      float a = 0.5, s = 0.0;
      for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
      return s;
    }
    float terrain(vec3 p) {
      vec3 q = p * 2.2 + u_seed * vec3(3.7, 9.1, 5.3);
      float h = fbm(q);
      return h + 0.18 * fbm(q * 4.1 + h * 2.5) - 0.09;
    }
    // view space → planet space (inverse pitch, then inverse yaw)
    vec3 toPlanet(vec3 v) {
      float cp = cos(u_pitch), sp = sin(u_pitch);
      v = vec3(v.x, v.y * cp + v.z * sp, -v.y * sp + v.z * cp);
      float cy = cos(u_yaw), sy = sin(u_yaw);
      return vec3(v.x * cy - v.z * sy, v.y, v.x * sy + v.z * cy);
    }

    void main() {
      vec2 uv = v_uv * vec2(u_res.x / u_res.y, 1.0);
      float d = length(uv);
      float px = 2.0 / u_res.y;
      vec3 sun = normalize(u_sun);
      vec3 col = vec3(0.0);
      float alpha = 0.0;

      // Atmosphere halo outside the disc, brighter on the sunward side.
      if (d < R + 0.2) {
        float outside = smoothstep(R - px, R + px, d);
        float glow = exp(-max(d - R, 0.0) * 20.0);
        float facing = 0.6 + 0.4 * dot(normalize(uv + 1e-5), normalize(sun.xy + vec2(1e-4)));
        float dayHalo = clamp(sun.z * 0.5 + 0.5, 0.0, 1.0);
        float a = glow * outside * (0.16 + 0.3 * dayHalo) * facing * (1.0 - u_wire * 0.75);
        col += u_accent * a;
        alpha += a;
      }

      if (d < R + px) {
        float inside = 1.0 - smoothstep(R - px, R + px, d);
        float z = sqrt(max(R * R - d * d, 0.0));
        vec3 n = vec3(uv, z) / R;
        vec3 p = toPlanet(n);
        float h = terrain(p);
        float land = smoothstep(SEA - 0.004, SEA + 0.004, h);
        float NdotL = dot(n, sun);
        float day = smoothstep(-0.12, 0.18, NdotL);

        // Bump-mapped normal from the terrain gradient (land only).
        vec3 tu = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-4, 0.0, 0.0));
        vec3 tv = cross(n, tu);
        float e = 0.012;
        float hu = terrain(toPlanet(normalize(n + tu * e)));
        float hv = terrain(toPlanet(normalize(n + tv * e)));
        vec3 nb = normalize(n - (tu * (hu - h) + tv * (hv - h)) * 6.0 * land);
        // Half-Lambert: soft wrap lighting keeps the day side bright and flat.
        float diff = pow(dot(nb, sun) * 0.5 + 0.5, 2.0);

        // Albedo: oceans are paper, land is inked — a printed globe, not a photo.
        vec3 ocean = mix(u_paper, u_soft, 0.22);
        float relief = clamp((h - SEA) / 0.3, 0.0, 1.0);
        vec3 landCol = mix(u_soft, u_ink, 0.15 + relief * 0.6);
        vec3 albedo = mix(ocean, landCol, land);

        vec3 lit = albedo * (0.55 + 0.5 * diff);
        vec3 hv2 = normalize(sun + vec3(0.0, 0.0, 1.0));
        float spec = pow(max(dot(n, hv2), 0.0), 140.0) * (1.0 - land) * day;
        lit += spec * mix(vec3(1.0), u_accent, 0.4) * 0.2;

        // Night side: shadowed paper plus accent city lights on land.
        vec3 night = albedo * mix(0.45, 0.10, u_dark);
        float cityN = noise(p * 38.0 + u_seed) * noise(p * 9.0 + 3.0);
        float city = smoothstep(0.40, 0.55, cityN) * land * smoothstep(SEA, SEA + 0.2, h);
        night += u_accent * city * 0.9;
        vec3 surf = mix(night, lit, day);

        // Faint drafting graticule every 15°.
        float lat = asin(clamp(p.y, -1.0, 1.0));
        float lon = atan(p.z, p.x);
        float latL = abs(fract(lat / (PI / 12.0) + 0.5) - 0.5);
        float lonL = abs(fract(lon / (PI / 12.0) + 0.5) - 0.5);
        float grat = max(1.0 - smoothstep(0.02, 0.045, latL), 1.0 - smoothstep(0.02, 0.045, lonL));
        surf = mix(surf, u_soft, grat * 0.10);

        // Accent coastline — the blueprint touch.
        float coast = 1.0 - smoothstep(0.0, 0.009, abs(h - SEA));
        surf = mix(surf, u_accent, coast * 0.75);

        // Clouds drift independently of the surface.
        float cy = cos(u_time * 0.03), sy = sin(u_time * 0.03);
        vec3 pc = vec3(p.x * cy - p.z * sy, p.y, p.x * sy + p.z * cy);
        float c = fbm(pc * 3.2 + u_seed * 7.0 + vec3(0.0, u_time * 0.01, 0.0));
        float cloud = smoothstep(0.54, 0.7, c) * 0.6;
        vec3 cloudCol = mix(vec3(1.0), u_ink, u_dark) * (0.3 + 0.7 * day * max(NdotL, 0.0));
        surf = mix(surf, cloudCol, cloud);

        // Rim light and terminator glow in accent.
        float fres = pow(1.0 - n.z, 3.0);
        surf += u_accent * fres * (0.18 + 0.32 * day);
        surf += u_accent * exp(-abs(NdotL) * 9.0) * land * 0.08;

        vec3 discCol = surf;
        float discA = inside;

        if (u_wire > 0.5) {
          // Wireframe: graticule, coastlines and height contours only.
          float contour = (1.0 - smoothstep(0.0, 0.004, abs(fract(h / 0.06 + 0.5) - 0.5) * 0.06)) * land;
          float rim = 1.0 - smoothstep(0.0, px * 1.5, R - d);
          vec3 wcol = u_soft * grat * 0.6 + u_soft * contour * 0.9 + u_accent * coast + u_ink * rim;
          float wa = clamp(grat * 0.5 + contour * 0.8 + coast + rim, 0.0, 1.0);
          discCol = wcol / max(wa, 1e-3);
          discA = inside * wa;
        }

        col = discCol * discA + col * (1.0 - discA);
        alpha = discA + alpha * (1.0 - discA);
      }

      gl_FragColor = vec4(col, alpha);
    }
  `;

  function createGLRenderer() {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    });
    if (!gl) return null;

    let program = null;
    let uniforms = {};
    let lost = false;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('planet shader:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };

    const setup = () => {
      const vs = compile(gl.VERTEX_SHADER, VERT);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return false;
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
      gl.useProgram(program);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, 'a_pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      uniforms = {};
      for (const name of ['u_res', 'u_time', 'u_seed', 'u_yaw', 'u_pitch', 'u_wire', 'u_dark', 'u_sun', 'u_ink', 'u_soft', 'u_accent', 'u_paper']) {
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      return true;
    };

    if (!setup()) return null;

    canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { lost = false; setup(); resize(); });

    let W = 0, H = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const side = Math.min(Math.round(canvas.clientWidth * dpr * state.quality), 720);
      W = side;
      H = Math.max(1, Math.round(side * (canvas.clientHeight / Math.max(canvas.clientWidth, 1))));
      canvas.width = W;
      canvas.height = H;
    };

    const rgbCache = {};
    const rgb = (hex) => rgbCache[hex] || (rgbCache[hex] = hexToRgb(hex));

    const draw = () => {
      if (lost || !program) return;
      gl.viewport(0, 0, W, H);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const c = state.colors;
      gl.uniform2f(uniforms.u_res, W, H);
      gl.uniform1f(uniforms.u_time, state.time);
      gl.uniform1f(uniforms.u_seed, (state.seed / 0xffff) * 10);
      gl.uniform1f(uniforms.u_yaw, state.yaw);
      gl.uniform1f(uniforms.u_pitch, state.pitch);
      gl.uniform1f(uniforms.u_wire, state.wire ? 1 : 0);
      gl.uniform1f(uniforms.u_dark, state.dark ? 1 : 0);
      gl.uniform3fv(uniforms.u_sun, state.sun);
      gl.uniform3fv(uniforms.u_ink, rgb(c.ink));
      gl.uniform3fv(uniforms.u_soft, rgb(c.soft));
      gl.uniform3fv(uniforms.u_accent, rgb(c.accent));
      gl.uniform3fv(uniforms.u_paper, rgb(c.paper));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    return { mode: 'webgl', resize, draw, rebuild() {} };
  }

  /* ----------------------------------------------------------------
     2D canvas fallback — wireframe globe with voxel-ish land dots
     ---------------------------------------------------------------- */
  function createCanvasRenderer() {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const POINTS = 1800;
    let land = [];
    let W = 0, H = 0;

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

    const rebuild = () => {
      land = [];
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < POINTS; i++) {
        const y = 1 - (i / (POINTS - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const theta = golden * i;
        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;
        const n = fbm(x * 2.1 + 13.7, y * 2.1 + 7.9, z * 2.1 + 3.3, state.seed);
        if (n < 0.5) continue;
        land.push({ x, y, z, hi: n > 0.575 });
      }
    };

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
      const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
      const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      const x = p.x * cy + p.z * sy;
      const z0 = -p.x * sy + p.z * cy;
      return { x, y: p.y * cp - z0 * sp, z: p.y * sp + z0 * cp };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const c = state.colors;
      const wire = state.wire;
      const [sx, sy, sz] = state.sun;
      ctx.clearRect(0, 0, W, H);
      const R = Math.min(W, H) * 0.42;
      const cx = W / 2, cy = H / 2;

      ctx.lineWidth = 1.25;
      ctx.strokeStyle = c.ink;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 1;
      ctx.strokeStyle = c.soft;
      for (const pts of rings) {
        const front = new Path2D(), back = new Path2D();
        let prev = null;
        for (const p of pts) {
          const q = rotate(p);
          const px = cx + q.x * R, py = cy - q.y * R;
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
        const light = Math.max(0.25, 0.35 + 0.65 * (q.x * sx + q.y * sy + q.z * sz));
        ctx.globalAlpha = q.z < 0 ? 0.15 : (0.3 + 0.7 * q.z) * light;
        ctx.fillStyle = p.hi ? c.accent : c.ink;
        const size = (p.hi ? 3.2 : 2.4) * (0.6 + 0.4 * Math.max(q.z, 0));
        ctx.fillRect(cx + q.x * R - size / 2, cy - q.y * R - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };

    rebuild();
    return { mode: 'canvas', resize, draw, rebuild };
  }

  /* ----------------------------------------------------------------
     Controller: animation loop, observers, pointer, seed, sun
     ---------------------------------------------------------------- */
  readColors();
  const renderer = createGLRenderer() || createCanvasRenderer();

  let running = false, inView = false, rafId = 0, last = 0;
  let slowFrames = 0;

  const frame = (now) => {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05) || 0.016;
    last = now;
    state.time += dt;
    state.spinBoost += (state.targetBoost - state.spinBoost) * 0.04;
    state.pitch += (state.targetPitch - state.pitch) * 0.05;
    state.yaw += (0.21 + state.spinBoost) * dt;
    state.wire = root.classList.contains('wireframe');
    renderer.draw();

    // Adaptive quality: drop internal resolution on GPUs that can't keep up.
    if (renderer.mode === 'webgl' && state.quality > 0.35) {
      slowFrames = dt > 0.026 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
      if (slowFrames > 45) {
        state.quality = Math.max(0.35, state.quality - 0.15);
        slowFrames = 0;
        renderer.resize();
      }
    }
    rafId = requestAnimationFrame(frame);
  };

  const start = () => {
    if (running || !animate || !inView || document.hidden) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(rafId);
  };
  const redraw = () => {
    if (!running) {
      state.wire = root.classList.contains('wireframe');
      renderer.draw();
    }
  };

  const updateLabel = () => {
    seedLabel.textContent = state.seed.toString(16).toUpperCase().padStart(4, '0');
  };
  updateLabel();

  new ResizeObserver(() => { renderer.resize(); redraw(); }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    inView ? start() : stop();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  new MutationObserver(() => { readColors(); redraw(); }).observe(root, { attributes: true, attributeFilter: ['class', 'style'] });

  if (finePointer) {
    window.addEventListener('mousemove', (event) => {
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      state.targetBoost = nx * 0.72;
      state.targetPitch = 0.35 + ny * 0.8;
    });
  }

  const reseed = () => {
    state.seed = (Math.random() * 0xffff) | 0;
    renderer.rebuild();
    updateLabel();
    redraw();
    onReseed?.(seedLabel.textContent);
  };

  return {
    canvas,
    reseed,
    seedHex: () => seedLabel.textContent,
    setSun(vec) { state.sun = vec; redraw(); },
    get mode() { return renderer.mode; },
    get quality() { return state.quality; },
  };
};

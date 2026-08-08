// Dithered-warp background fields: a vanilla WebGL port of the
// @paper-design/shaders "Dithering" effect (shape: warp, type: 4x4) used by
// the React hero-dithering-card component — rewritten dependency-free so it
// works on this static site under CSP script-src 'self'. Initialises every
// canvas.hero-dither on the page: the home hero card and the compact
// page-hero cards on subpages.
//
// A domain-warped fbm noise field drifts slowly and is quantised through a
// 4x4 Bayer matrix, giving the chunky ordered-dither "sweep". The canvas
// renders at one cell per fragment (buffer ≈ CSS size / CELL_PX) and is
// upscaled with image-rendering: pixelated, so the GPU cost stays tiny.
// Foreground colour is read from the canvas' computed CSS `color`
// (var(--accent-blue)), so it follows the theme; opacity/blend-mode live in
// CSS. Hovering the card eases the animation speed up, like the original's
// isHovered state.

const CELL_PX = 3; // CSS pixels per dither cell
const SPEED_REST = 0.2;
const SPEED_HOVER = 0.6;

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_color;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

/* Compact ordered-dither thresholds: bayer2 nested once gives the 4x4 matrix. */
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

float bayer4(vec2 a) {
  return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  uv.x *= u_res.x / u_res.y;

  /* Domain-warped field: two fbm passes feed a third, drifting with time. */
  vec2 p = uv * 3.0;
  vec2 w = vec2(
    fbm(p + vec2(0.0, 0.0) + u_time * 0.10),
    fbm(p + vec2(5.2, 1.3) - u_time * 0.13)
  );
  float f = fbm(p + 2.4 * w + vec2(u_time * 0.05, 0.0));
  f = smoothstep(0.32, 0.78, f);

  float d = step(bayer4(gl_FragCoord.xy) + 0.001, f);
  gl_FragColor = vec4(u_color * d, d);
}
`;

const compile = (gl, type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const parseCssColor = (value) => {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(value || "");
  return m ? [m[1] / 255, m[2] / 255, m[3] / 255] : [0.36, 0.55, 1];
};

const initCanvas = (canvas, reducedMotion) => {
  const card = canvas.closest(".hero-card, .page-hero-card") || canvas.parentElement;
  if (!(card instanceof HTMLElement)) return;

  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: "low-power"
  });
  if (!gl) return; // no WebGL: the card simply keeps its flat surface

  const vert = compile(gl, gl.VERTEX_SHADER, VERT);
  const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vert || !frag) return;
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(program, "u_res");
  const uTime = gl.getUniformLocation(program, "u_time");
  const uColor = gl.getUniformLocation(program, "u_color");

  const syncColor = () => gl.uniform3fv(uColor, parseCssColor(getComputedStyle(canvas).color));
  syncColor();
  // The theme toggle swaps body.light-mode; re-read the accent when it does.
  new MutationObserver(syncColor).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(2, Math.round(rect.width / CELL_PX));
    const h = Math.max(2, Math.round(rect.height / CELL_PX));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    }
  };

  let time = 7.0; // arbitrary start offset so the first frame isn't degenerate
  let speed = SPEED_REST;
  let speedTarget = SPEED_REST;
  let prev = 0;
  let frameHandle = 0;

  const draw = () => {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Reduced motion: draw one static field, no loop, no hover reaction.
  if (reducedMotion) {
    resize();
    draw();
    window.addEventListener("resize", () => { resize(); draw(); });
    return;
  }

  const step = (now) => {
    frameHandle = window.requestAnimationFrame(step);
    const dt = Math.min(0.1, (now - prev) / 1000 || 0);
    prev = now;
    // Ease toward the hover speed, echoing the React version's transition.
    speed += (speedTarget - speed) * Math.min(1, dt * 5);
    time += dt * speed;
    resize();
    draw();
  };

  const start = () => {
    if (frameHandle) return;
    prev = performance.now();
    frameHandle = window.requestAnimationFrame(step);
  };

  const stop = () => {
    if (!frameHandle) return;
    window.cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  };

  card.addEventListener("mouseenter", () => { speedTarget = SPEED_HOVER; });
  card.addEventListener("mouseleave", () => { speedTarget = SPEED_REST; });

  // Only animate while the card is on screen.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => (entry.isIntersecting ? start() : stop()));
    }).observe(card);
  } else {
    start();
  }
};

export function initHeroDither() {
  const canvases = document.querySelectorAll("canvas.hero-dither");
  if (!canvases.length) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  canvases.forEach((canvas) => initCanvas(canvas, reducedMotion));
}

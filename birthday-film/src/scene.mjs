// Shared, dependency-free description of the whole film.
// Used by the three.js renderer (itemsAt / cameraAt) and by the audio synth (sfx).
// Time is measured in "exposures": 12 per second, 96 in total = 8 seconds.

export const FPS = 12;
export const TOTAL = 96;
export const TABLE_Y = -0.4;

// ---------------------------------------------------------------- catalogue
// Generic, unbranded parts on a fixed stud grid. 1 stud = 1 unit,
// brick = 1.2 high, plate = 0.4 high (one third of a brick).
export const PARTS = {
  base:        { k: 'box',   w: 72, d: 20, h: 0.4 },
  brick1x1:    { k: 'box',   w: 1, d: 1, h: 1.2 },
  brick1x2:    { k: 'box',   w: 1, d: 2, h: 1.2 },
  brick2x2:    { k: 'box',   w: 2, d: 2, h: 1.2 },
  brick2x4:    { k: 'box',   w: 2, d: 4, h: 1.2 },
  plate1x1:    { k: 'box',   w: 1, d: 1, h: 0.4 },
  plate1x2:    { k: 'box',   w: 1, d: 2, h: 0.4 },
  plate2x2:    { k: 'box',   w: 2, d: 2, h: 0.4 },
  plate2x4:    { k: 'box',   w: 2, d: 4, h: 0.4 },
  slope1x2:    { k: 'slope', w: 1, d: 2, h: 1.2 },
  round1x1:    { k: 'round', h: 1.2 },
  roundplate:  { k: 'round', h: 0.4 },
  // translucent pieces
  tround:      { k: 'round', h: 1.2, t: true },
  troundplate: { k: 'round', h: 0.4, t: true },
  tplate:      { k: 'box',   w: 1, d: 1, h: 0.4, t: true },
};

// rose gold, champagne, soft pink, white, deep burgundy
export const C = {
  rose: 0xc98a84, roseL: 0xdea496, champ: 0xefce8c, gold: 0xdca43a,
  blush: 0xf4b9c6, white: 0xfbf4ee, burg: 0x7a1636, wine: 0x4d0b22,
  cream: 0xe9d7bc, amber: 0xffc65a, pinkGlow: 0xff9fb8,
};

// ------------------------------------------------------------------ helpers
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashf(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1013904223)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const rnd = mulberry32(5150);
const R = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;

const makers = [];
const sfx = [];
let nid = 1;
const HP = Math.PI / 2;

// A brick that is "placed" by the animator: falls in over 4 exposures,
// squashes on landing, settles, then rests with tiny stop-motion jitter.
const FALL = [1, 0.62, 0.3, 0.08];
function drop(o) {
  const id = nid++;
  const h = o.h ?? 6;
  const dir = o.dir ?? [0, 1, 0];
  const jit = o.jit ?? 0.012;
  if (o.click !== false) sfx.push({ e: o.t0 + 4, type: 'click', v: o.v ?? 1, p: hashf(id, 1) });
  makers.push((e, out) => {
    const k = e - o.t0;
    if (k < 0) return;
    let dx = 0, dy = 0, dz = 0, sx = 1, sy = 1, sz = 1, tilt = 0;
    if (k < 4) {
      const f = FALL[k] * h;
      dx = dir[0] * f; dy = dir[1] * f; dz = dir[2] * f;
      tilt = (hashf(id, 2) - 0.5) * 0.7 * FALL[k];
    } else if (k === 4) { sy = 0.86; sx = sz = 1.06; }
    else if (k === 5) { sy = 1.04; sx = sz = 0.985; }
    const j = k < 4 ? 0 : jit;
    out.push({
      id, part: o.part, order: o.order,
      x: o.x + dx + (hashf(id, e, 3) - 0.5) * 2 * j,
      y: o.y + dy + (hashf(id, e, 4) - 0.5) * 2 * j * 0.5,
      z: o.z + dz + (hashf(id, e, 5) - 0.5) * 2 * j,
      rx: o.rx ?? 0, ry: (o.ry ?? 0) + (hashf(id, e, 6) - 0.5) * 2 * j * 0.25,
      rz: (o.rz ?? 0) + tilt,
      sx: sx * (o.sx ?? 1), sy: sy * (o.sy ?? 1), sz: sz * (o.sz ?? 1),
      color: o.color, glow: o.glow ?? 0,
    });
  });
}

// A piece that pops on (and optionally off) in place.
const POPS = [0.2, 1.35, 0.9, 1.06];
function pop(o) {
  const id = nid++;
  if (o.sfx) sfx.push({ e: o.t0, type: 'pop', v: o.v ?? 1, p: hashf(id, 7) });
  makers.push((e, out) => {
    const k = e - o.t0;
    if (k < 0) return;
    let s = k < 4 ? POPS[k] : 1;
    if (o.te !== undefined) {
      if (e >= o.te + 3) return;
      if (e >= o.te) s = [0.7, 0.4, 0.15][e - o.te];
    }
    let glow = o.glow ?? 0;
    if (o.twinkle) {
      glow *= 0.35 + 1.3 * hashf(id, Math.floor(e / 1), 9);
      if (k >= 4 && hashf(id, e, 10) < 0.07) return;
    }
    const j = o.jit ?? 0.008;
    out.push({
      id, part: o.part, order: o.order,
      x: o.x + (hashf(id, e, 3) - 0.5) * 2 * j,
      y: o.y + (o.bob ? 0.2 * Math.sin(e * 0.9 + id) : 0) + (hashf(id, e, 4) - 0.5) * 2 * j,
      z: o.z + (hashf(id, e, 5) - 0.5) * 2 * j,
      rx: o.rx ?? 0, ry: o.ry ?? 0, rz: o.rz ?? 0,
      sx: s * (o.sx ?? 1), sy: s * (o.sy ?? 1), sz: s * (o.sz ?? 1),
      color: o.color, glow,
    });
  });
}

function stat(o) {
  const id = nid++;
  makers.push((e, out) => {
    out.push({
      id, part: o.part, order: o.order, x: o.x, y: o.y, z: o.z,
      rx: o.rx ?? 0, ry: o.ry ?? 0, rz: o.rz ?? 0, sx: 1, sy: 1, sz: 1, color: o.color, glow: o.glow ?? 0,
    });
  });
}

// ------------------------------------------------------------ the set
// wooden table is drawn by the renderer; baseplate + brick backdrop are here.
stat({ part: 'base', x: 0, y: TABLE_Y, z: 0, color: C.cream });

const WALL_Z = -10.4; // back face of the backdrop plates
const WALL_ROWS = 22;
for (let r = 0; r < WALL_ROWS; r++) {
  const y = 1 + 2 * r;
  const shade = (c1, c2, t) => {
    const a = [(c1 >> 16) & 255, (c1 >> 8) & 255, c1 & 255], b = [(c2 >> 16) & 255, (c2 >> 8) & 255, c2 & 255];
    return (Math.round(lerp(a[0], b[0], t)) << 16) | (Math.round(lerp(a[1], b[1], t)) << 8) | Math.round(lerp(a[2], b[2], t));
  };
  const rowCol = () => shade(pick([0x6a1430, 0x5e1029, 0x701a36, 0x621230]), 0x2d0816, r / (WALL_ROWS - 1) * 0.65);
  let x = -42;
  if (r % 2 === 1) { stat({ part: 'plate2x2', x: x + 1, y, z: WALL_Z, rx: HP, color: rowCol() }); x += 2; }
  while (x + 4 <= 42) { stat({ part: 'plate2x4', x: x + 2, y, z: WALL_Z, rx: HP, ry: HP, color: rowCol() }); x += 4; }
  if (x < 42) stat({ part: 'plate2x2', x: x + 1, y, z: WALL_Z, rx: HP, color: rowCol() });
}

// ----------------------------------------------------- 1. gift boxes (e 1-20)
function bigBox(cx, cz, main, ribbon, t) {
  let i = 0;
  for (let L = 0; L < 3; L++)
    for (const [dx, col] of [[-2, main], [0, ribbon], [2, main]])
      drop({ part: 'brick2x4', x: cx + dx, y: L * 1.2, z: cz, color: col, t0: t + Math.floor(i++ * 0.8), h: 7 });
  for (const [dx, col] of [[-2, main], [0, ribbon], [2, main]])
    drop({ part: 'plate2x4', x: cx + dx, y: 3.6, z: cz, color: col, t0: t + 8 + dx / 2 + 1, h: 5 });
  // bow: two slopes + round knot
  drop({ part: 'slope1x2', x: cx - 1.5, y: 4.0, z: cz, ry: -HP, color: C.champ, t0: t + 10, h: 5, glow: 0.05 });
  drop({ part: 'slope1x2', x: cx + 1.5, y: 4.0, z: cz, ry: HP, color: C.champ, t0: t + 11, h: 5, glow: 0.05 });
  drop({ part: 'round1x1', x: cx, y: 4.0, z: cz, color: C.gold, t0: t + 12, h: 5, glow: 0.08 });
}
function smallBox(cx, cz, main, ribbon, t) {
  for (let L = 0; L < 2; L++) {
    drop({ part: 'brick1x2', x: cx - 0.5, y: L * 1.2, z: cz, color: main, t0: t + L * 2, h: 5 });
    drop({ part: 'brick1x2', x: cx + 0.5, y: L * 1.2, z: cz, color: ribbon, t0: t + L * 2 + 1, h: 5 });
  }
  drop({ part: 'brick2x2', x: cx, y: 2.4, z: cz, color: main, t0: t + 5, h: 5 });
  drop({ part: 'roundplate', x: cx - 0.5, y: 3.6, z: cz - 0.5, color: C.gold, t0: t + 7, h: 4 });
  drop({ part: 'brick1x1', x: cx + 0.5, y: 3.6, z: cz + 0.5, color: ribbon, t0: t + 7, h: 4 });
}
bigBox(-22, 4.5, C.blush, C.champ, 1);
bigBox(22, 4.5, C.white, C.rose, 7);
smallBox(-14, 7, C.white, C.gold, 3);
smallBox(14, 7, C.burg, C.blush, 10);
smallBox(-29, 8, C.burg, C.champ, 6);
smallBox(29, 8, C.rose, C.white, 12);

// ------------------------------------------------- 2. balloons (e 12-40)
function balloon(bx, by, bz, Rr, color, t, stringTo = 0) {
  const layers = Math.floor((Rr * 2) / 0.4);
  const base = by - Rr;
  for (let j = 0; j < layers; j++) {
    const yc = (j - (layers - 1) / 2) * 0.4;
    const r = Math.sqrt(Math.max(0, Rr * Rr - yc * yc));
    for (let i = -Math.ceil(r); i <= Math.ceil(r); i++)
      for (let k = -Math.ceil(r); k <= Math.ceil(r); k++)
        if (Math.hypot(i, k) <= r + 0.15)
          drop({
            part: 'troundplate', x: bx + i, y: base + j * 0.4, z: bz + k, color,
            t0: t + Math.floor(j * 0.55) + ((i + k) & 1), h: 3, glow: 0.45, click: (i === 0 && k === 0), v: 0.5,
          });
  }
  // knot + string
  const bottom = base - 0.4;
  drop({ part: 'brick1x1', x: bx, y: bottom - 0.4, z: bz, color, t0: t + layers * 0.55 + 1, h: 3 });
  let y = bottom - 0.4 - 0.4, n = 0;
  while (y > stringTo) {
    drop({ part: 'roundplate', x: bx, y, z: bz, color: C.champ, t0: Math.floor(t + layers * 0.55 + 2 + n * 0.25), h: 2, click: false });
    y -= 0.4; n++;
  }
}
balloon(-26.5, 12, -1.5, 2.6, C.blush, 13, 0);
balloon(-21.5, 15.8, -1.5, 2.6, C.champ, 17, 4.4);
balloon(-16.5, 11.5, 0.5, 2.6, C.rose, 21, 0);
balloon(26.5, 12.5, -1.5, 2.6, C.rose, 15, 0);
balloon(21.5, 15.8, -1.5, 2.6, C.white, 19, 4.4);
balloon(16.5, 11.5, 0.5, 2.6, C.blush, 23, 0);

// --------------------------------------- 3. the "21" (e 22-52) + candles
const DIGITS = {
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
};
const LAYER_COL = [C.rose, C.roseL, 0xe6b499, C.champ, C.gold, C.champ, 0xf6e6bd];
function digit(rows, x0, zc, tStart) {
  // each pixel row is two brick layers tall (2.4) so the number reads as the centrepiece
  for (let L = 0; L < 14; L++) {
    const R6 = L >> 1, sub = L & 1;
    const row = rows[6 - R6];
    let c = 0, n = 0;
    while (c < 5) {
      if (row[c] !== '#') { c++; continue; }
      let c1 = c; while (c1 < 5 && row[c1] === '#') c1++;
      const runs = [];
      let i = c;
      while (i < c1) { if (c1 - i >= 2) { runs.push([i, 2]); i += 2; } else { runs.push([i, 1]); i += 1; } }
      if (sub === 1) { // interlock: odd layers lay the long bricks from the other end
        const k = c1 - c; const alt = []; let j = c1;
        while (j > c) { if (j - c >= 2) { alt.push([j - 2, 2]); j -= 2; } else { alt.push([j - 1, 1]); j -= 1; } }
        runs.length = 0; runs.push(...alt.reverse());
      }
      for (const [ci, w] of runs) {
        const t0 = tStart + R6 * 4 + sub * 2 + (n++ % 2);
        const col = hashf(nid, 77) < 0.12 ? C.blush : LAYER_COL[R6];
        if (w === 2) drop({ part: 'brick2x4', x: x0 + 2 * ci + 2, y: L * 1.2, z: zc, ry: HP, color: col, t0, h: 6, glow: 0.06, v: 1.2 });
        else drop({ part: 'brick2x2', x: x0 + 2 * ci + 1, y: L * 1.2, z: zc, color: col, t0, h: 6, glow: 0.06, v: 1.2 });
      }
      c = c1;
    }
  }
}
digit(DIGITS[2], -11, -4, 22);
digit(DIGITS[1], 1, -4, 22);

function candle(x, z, color, t) {
  drop({ part: 'round1x1', x, y: 16.8, z, color, t0: t, h: 4 });
  const id = nid++;
  sfx.push({ e: t + 4, type: 'flame', v: 0.7, p: hashf(id, 1) });
  makers.push((e, out) => {
    const k = e - (t + 4);
    if (k < 0) return;
    const s = k < 2 ? [0.4, 1.2][k] : 1;
    const f = hashf(id, e, 1);
    out.push({
      id, part: 'tround', x: x + (f - 0.5) * 0.14, y: 18.0 + (hashf(id, e, 2) - 0.5) * 0.15, z,
      rx: 0, ry: 0, rz: (f - 0.5) * 0.4, sx: 0.5 * s, sy: (0.55 + 0.45 * hashf(id, e, 3)) * s, sz: 0.5 * s,
      color: C.amber, glow: 2.2 + 1.6 * hashf(id, e, 4),
    });
  });
}
[-7.5, -5.5, -3.5].forEach((x, i) => candle(x, -3.5, i % 2 ? C.blush : C.white, 55 + i));
[5.5, 6.5].forEach((x, i) => candle(x, -3.5, i % 2 ? C.white : C.blush, 56 + i));

// sparkles popping around the digits while they are built
for (let i = 0; i < 34; i++) {
  const t0 = 24 + Math.floor(rnd() * 36);
  pop({
    part: 'tround', x: R(-14, 14), y: R(0.5, 19), z: R(-2, 3), t0, te: t0 + 3, sfx: i % 3 === 0, v: 0.5,
    color: pick([C.champ, C.gold, C.blush, C.white]), glow: 2.4, sx: 0.4, sy: 0.4, sz: 0.4,
  });
}

// ------------------------------------------------- 4. fireworks of bricks
function burst(x, y, z, t0, n, Rs, cols, v = 1) {
  const id0 = nid++;
  sfx.push({ e: t0, type: 'burst', v, p: hashf(id0, 1) });
  // flash
  makers.push((e, out) => {
    const k = e - t0;
    if (k < 0 || k > 1) return;
    out.push({ id: id0, part: 'tround', x, y, z, rx: 0, ry: 0, rz: 0, sx: 2.6 * Rs, sy: 2.6 * Rs, sz: 2.6 * Rs, color: C.white, glow: 4.5, order: undefined });
  });
  for (let i = 0; i < n; i++) {
    const id = nid++;
    const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
    const d = [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th) * 0.95 + 0.15, Math.cos(ph) * 0.55];
    const sp = (0.75 + rnd() * 0.75) * Rs;
    const col = pick(cols);
    const pos = (k) => {
      const r = sp * 7 * (1 - Math.exp(-0.42 * k));
      return [x + d[0] * r, y + d[1] * r - 0.075 * k * k, z + d[2] * r];
    };
    makers.push((e, out) => {
      const k = e - t0;
      if (k < 1 || k > 11) return;
      const life = k > 8 ? [0.7, 0.45, 0.2][k - 9] : 1;
      const p = pos(k);
      const s = (k === 1 ? 0.5 : 0.8) * life;
      out.push({ id, part: 'tround', x: p[0], y: p[1], z: p[2], rx: k * 0.9, ry: k * 0.6, rz: 0, sx: s, sy: s, sz: s, color: col, glow: 2.6 * (1 - k / 14) });
      if (k >= 3) {
        const q = pos(k - 2);
        out.push({ id: id + 5000, part: 'troundplate', x: q[0], y: q[1], z: q[2], rx: HP, ry: 0, rz: k, sx: 0.6 * life, sy: 0.6 * life, sz: 0.6 * life, color: col, glow: 1.4 * (1 - k / 14) });
      }
    });
  }
}
const FW = [C.champ, C.gold, C.rose, C.blush, C.white];
burst(-18, 28, -7, 40, 24, 1.0, FW);
burst(19, 30, -7, 45, 24, 1.0, FW);
burst(0, 34, -8, 49, 26, 1.15, FW);
burst(-30, 24, -7, 54, 22, 0.95, FW);
burst(30, 26, -7, 58, 22, 0.95, FW);
// grand finale (kept to the margins by the end so the lettering stays readable)
burst(-34, 33, -8, 72, 28, 1.0, FW, 1.2);
burst(34, 34, -8, 74, 28, 1.0, FW, 1.2);
burst(0, 28, -8, 77, 36, 1.45, FW, 1.5);
burst(-36, 20, -8, 80, 24, 0.95, FW, 1.0);
burst(36, 21, -8, 82, 24, 0.95, FW, 1.0);
burst(-38, 38, -8, 85, 24, 0.9, FW, 1.0);
burst(38, 38, -8, 87, 24, 0.9, FW, 1.0);
burst(-36, 29, -8, 89, 26, 0.85, FW, 1.2);
burst(36, 29, -8, 90, 26, 0.85, FW, 1.2);

// --------------------------------------- 5. mosaic lettering on the backdrop
const F3 = {
  H: ['#.#', '#.#', '###', '#.#', '#.#'], A: ['.#.', '#.#', '###', '#.#', '#.#'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  B: ['##.', '#.#', '##.', '#.#', '##.'], I: ['###', '.#.', '.#.', '.#.', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], ' ': ['...', '...', '...', '...', '...'],
};
const F5 = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
};
const LZ = -10.0;
(function lettering() {
  // HAPPY BIRTHDAY : 1x1 plates
  const text = 'HAPPY BIRTHDAY';
  const widths = [...text].map((ch) => (ch === ' ' ? 3 : 4));
  const total = widths.reduce((a, b) => a + b, 0) - 1;
  let cx = Math.floor(-total / 2);
  for (const ch of text) {
    const g = F3[ch];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++)
        if (g[r][c] === '#') {
          const xc = cx + c + 0.5, yc = 38.5 - r;
          const col = (r + c) % 7 === 0 ? C.white : C.champ;
          drop({
            part: 'plate1x1', x: xc, y: yc, z: LZ, rx: HP, color: col,
            t0: 58 + Math.floor(((xc + total / 2) / total) * 12), h: 9, dir: [0, 0.3, 1], glow: 0.14, v: 0.2, jit: 0.006,
          });
        }
    cx += ch === ' ' ? 3 : 4;
  }
  // SEAN : 2x2 plates, big
  let sx = -23;
  for (const ch of 'SEAN') {
    const g = F5[ch];
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (g[r][c] === '#') {
          const xc = sx + c * 2 + 1, yc = 31 - r * 2;
          drop({
            part: 'plate2x2', x: xc, y: yc, z: LZ, rx: HP, color: [C.champ, C.champ, 0xe9c28c, C.roseL, C.roseL, C.rose, C.rose][r],
            t0: 68 + Math.floor(((xc + 23) / 46) * 12), h: 10, dir: [0, 0.3, 1], glow: 0.18, v: 0.35, jit: 0.006,
          });
        }
    sx += 12;
  }
})();

// stars & hearts built from plates on the backdrop
const STAR = ['..#..', '..#..', '#####', '.###.', '.#.#.'];
function star(cx, cy, t0) {
  const id = nid++;
  STAR.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '#') {
      const bx = cx + c - 2, by = cy + 2 - r;
      pop({ part: 'plate1x1', x: bx, y: by, z: LZ, rx: HP, color: C.champ, t0: t0 + (r % 2), glow: 1.0, twinkle: true, sfx: c === 2 && r === 0, v: 0.5 });
    }
  }));
}
[[-29.5, 30.5, 66], [29.5, 30.5, 69], [-37.5, 31.5, 72], [37.5, 31.5, 74], [-33.5, 38.5, 76], [33.5, 38.5, 79]]
  .forEach(([x, y, t]) => star(x, y, t));
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
function heart(cx, cy, t0) {
  HEART.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '#')
      pop({ part: 'tplate', x: cx + c - 3, y: cy + 2.5 - r, z: LZ + 0.5, rx: HP, color: C.pinkGlow, t0: t0 + (r >> 1), glow: 1.2, bob: true, sfx: r === 0 && c === 1, v: 0.5 });
  }));
}
heart(-32.5, 24, 60);
heart(32.5, 24, 63);
heart(-38.5, 12, 56);
heart(38.5, 12, 58);

// -------------------------------------------- 6. floating ribbons (plates)
function ribbon(x0, dir, t0) {
  const N = 22;
  for (let i = 0; i < N; i++) {
    const id = nid++;
    makers.push((e, out) => {
      const grow = (e - t0) * 1.1;
      if (i > grow) return;
      const s = i / N, ph = e * 0.45;
      const f = (u) => ({
        x: x0 + dir * (7 * u + 2.2 * Math.sin(3.4 * Math.PI * u + ph)),
        y: 5 + 16 * Math.pow(u, 0.9),
        z: 2 + 2.5 * Math.sin(2.2 * Math.PI * u + ph * 0.7),
      });
      const a = f(s), b = f(s + 0.02);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const sc = i > grow - 1 ? 0.6 : 1;
      out.push({
        id, part: 'plate1x2', order: 'ZXY', x: a.x, y: a.y, z: a.z, rx: HP, ry: HP, rz: ang, sx: sc, sy: sc, sz: sc,
        color: i % 3 === 0 ? C.blush : i % 3 === 1 ? C.champ : C.white, glow: 0.2,
      });
    });
  }
  sfx.push({ e: t0 + 1, type: 'swoosh', v: 0.6, p: 0.3 });
}
ribbon(-22, -1, 30);
ribbon(22, 1, 34);

// ------------------------------------------ 7. fairy bokeh studs on the wall
{
  const nogo = (x, y) =>
    (Math.abs(x) < 29 && y > 33 && y < 40) || (Math.abs(x) < 26 && y > 17 && y < 33.5) ||
    false;
  let n = 0;
  while (n < 90) {
    const x = Math.floor(R(-41, 41)) + 0.5, y = Math.floor(R(2, 43)) + 0.5;
    if (nogo(x, y)) continue;
    const id = nid++, col = pick([C.champ, C.gold, C.blush, C.white, C.amber]);
    const big = rnd() < 0.3 ? 1.0 : 0.65;
    makers.push((e, out) => {
      const tw = hashf(id, Math.floor(e / 2), 1);
      out.push({
        id, part: 'tround', x, y, z: -9.95, rx: HP, ry: 0, rz: 0, sx: big, sy: 0.7, sz: big, color: col,
        glow: (e < 6 ? 1.6 : 0.5) + 1.8 * tw,
      });
    });
    n++;
  }
}

// ------------------------------------------------------ 8. confetti shower
{
  const resting = (x, z) => (Math.abs(x) < 36 && Math.abs(z) < 10 ? 0.15 : TABLE_Y + 0.02);
  const make = (t0, y0) => {
    const id = nid++;
    let x = R(-40, 40), z = R(-8.5, 14);
    if (Math.abs(x) < 12 && z > -6.5 && z < -1) z += 8;
    const v = R(1.3, 2.3), ph = R(0, 6.28), sw = R(0.2, 0.7), w = [R(0.4, 1.3), R(0.4, 1.3), R(0.4, 1.3)];
    const part = rnd() < 0.3 ? 'roundplate' : 'plate1x1';
    const col = pick([C.champ, C.gold, C.rose, C.blush, C.white, C.roseL, C.burg]);
    const rest = resting(x, z);
    const kLand = Math.ceil((y0 - rest) / v);
    makers.push((e, out) => {
      const k = e - t0;
      if (k < 0) return;
      if (k >= kLand) {
        out.push({ id, part, x: x + Math.sin(ph + kLand) * sw * kLand * 0.15, y: rest, z, rx: 0, ry: w[0] * 7, rz: 0, sx: 1, sy: 1, sz: 1, color: col, glow: 0.1 });
        return;
      }
      out.push({
        id, part, x: x + Math.sin(ph + k * 0.5) * sw * k * 0.15, y: y0 - v * k, z: z + Math.cos(ph + k * 0.4) * 0.6,
        rx: ph + k * w[0], ry: k * w[1], rz: k * w[2], sx: 1, sy: 1, sz: 1, color: col, glow: 0.35,
      });
    });
  };
  for (let i = 0; i < 80; i++) make(Math.floor(R(30, 74)), R(44, 52));
  for (let i = 0; i < 260; i++) make(Math.floor(R(70, 92)), R(42, 54));
  for (let e = 80; e < TOTAL; e += 3) sfx.push({ e, type: 'glitter', v: 1, p: hashf(e, 3) });
}

// ================================================================ API
export function itemsAt(e) {
  const out = [];
  for (const m of makers) m(e, out);
  return out;
}
export function sfxList() { return sfx; }

// ---- designed camera move: stud-level macro -> wide finale
const K = [
  { e: 0,  p: [-19, 1.1, 9.5],  l: [-13.5, 0.8, 3.5], fov: 24, ap: 0.012 },
  { e: 12, p: [-14, 2.6, 13],   l: [-17, 3.2, 3],     fov: 26, ap: 0.007 },
  { e: 26, p: [-7, 5, 20],      l: [-3, 5, -2],       fov: 30, ap: 0.0045 },
  { e: 46, p: [6, 9, 28],       l: [0, 9, -3],        fov: 34, ap: 0.0035 },
  { e: 62, p: [2, 14, 40],      l: [0, 14.5, -6],     fov: 34, ap: 0.0016 },
  { e: 82, p: [0, 17.5, 60],    l: [0, 19.5, -7],     fov: 34, ap: 0.0005 },
  { e: 95, p: [0, 18, 62.5],    l: [0, 20, -7],       fov: 34.5, ap: 0.0005 },
];
function hermite(a, b, ma, mb, t) {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * ma + (-2 * t3 + 3 * t2) * b + (t3 - t2) * mb;
}
function chan(i, get, e) {
  const n = K.length;
  const a = K[i], b = K[i + 1];
  const prev = K[Math.max(0, i - 1)], next = K[Math.min(n - 1, i + 2)];
  const m = (x0, x1, t0, t1) => (t1 === t0 ? 0 : (x1 - x0) / (t1 - t0));
  const ma = (i === 0 ? 0 : m(get(prev), get(b), prev.e, b.e)) * (b.e - a.e);
  const mb = (i + 1 === n - 1 ? 0 : m(get(a), get(next), a.e, next.e)) * (b.e - a.e);
  return hermite(get(a), get(b), ma, mb, (e - a.e) / (b.e - a.e));
}
export function cameraAt(e) {
  let i = 0;
  while (i < K.length - 2 && e >= K[i + 1].e) i++;
  const c = (g) => chan(i, g, e);
  const pos = [c((k) => k.p[0]), c((k) => k.p[1]), c((k) => k.p[2])];
  const look = [c((k) => k.l[0]), c((k) => k.l[1]), c((k) => k.l[2])];
  const fov = c((k) => k.fov), ap = c((k) => k.ap);
  const j = 0.01 * (1 + (Math.max(0, 40 - e) / 40) * 2);
  pos[0] += (hashf(e, 1, 55) - 0.5) * 2 * j; pos[1] += (hashf(e, 2, 55) - 0.5) * 2 * j;
  const focus = Math.hypot(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]);
  // light "switches on" over the first exposures, then flickers slightly
  const on = [0.04, 0.3, 0.1, 0.55, 0.85, 1][e] ?? 1;
  const flicker = 1 + (hashf(e, 3, 91) - 0.5) * 0.09;
  return { pos, look, fov, focus, aperture: ap, key: on * flicker };
}

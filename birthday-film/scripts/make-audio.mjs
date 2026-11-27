// Synthesised score + foley for the stop-motion birthday film.
// Everything is generated from scratch (no samples): plastic clicks, marimba,
// music box, pops, whooshes. Event times come from src/scene.mjs so sound and
// picture stay locked to the same 12-exposures-per-second grid.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sfxList, FPS, TOTAL, hashf} from '../src/scene.mjs';

const SR = 44100;
const DUR = TOTAL / FPS; // 8 s
const N = Math.floor(SR * DUR);
const dryL = new Float32Array(N), dryR = new Float32Array(N);
const sendL = new Float32Array(N), sendR = new Float32Array(N);
const TAU = Math.PI * 2;
const E = (e) => e / FPS;

let seed = 99;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return ((seed >>> 0) / 4294967296); };

function voice(t, dur, gain, pan, send, fn) {
  const i0 = Math.floor(t * SR), n = Math.floor(dur * SR);
  const a = (pan + 1) * Math.PI / 4, gl = Math.cos(a) * gain, gr = Math.sin(a) * gain;
  for (let i = 0; i < n; i++) {
    const j = i0 + i;
    if (j < 0 || j >= N) continue;
    const x = fn(i / SR, i);
    dryL[j] += x * gl; dryR[j] += x * gr;
    sendL[j] += x * gl * send; sendR[j] += x * gr * send;
  }
}
const att = (tt, a) => 1 - Math.exp(-tt / a);

// --- instruments -------------------------------------------------------
function marimba(t, f, vel = 1, pan = -0.15, send = 0.35) {
  let ph = rnd() * TAU;
  voice(t, 1.5, 0.30 * vel, pan, send, (tt) => {
    const d = Math.max(0.12, 0.42 * Math.pow(220 / f, 0.35));
    const s = Math.sin(TAU * f * tt + ph) * Math.exp(-tt / d)
      + 0.42 * Math.sin(TAU * f * 3.99 * tt) * Math.exp(-tt / 0.055)
      + 0.12 * Math.sin(TAU * f * 9.9 * tt) * Math.exp(-tt / 0.018);
    const knock = (Math.sin(TAU * 1800 * tt) + Math.sin(TAU * 2570 * tt)) * 0.06 * Math.exp(-tt / 0.004);
    return (s + knock) * att(tt, 0.0012);
  });
}
function musicBox(t, f, vel = 1, pan = 0.2, send = 0.55) {
  const parts = [[1, 1, 1.0], [2.0, 0.34, 0.45], [3.99, 0.2, 0.22], [6.27, 0.1, 0.12], [9.2, 0.05, 0.06]];
  voice(t, 2.2, 0.20 * vel, pan, send, (tt) => {
    let s = 0;
    for (const [m, a, d] of parts) s += a * Math.sin(TAU * f * m * (1 + 0.0004 * m) * tt) * Math.exp(-tt / d);
    return s * att(tt, 0.0006);
  });
}
function click(t, p, vol = 1) {
  const f = 1500 + 1100 * p;
  let b1 = 0, b2 = 0;
  const pan = (rnd() - 0.5) * 0.7;
  voice(t, 0.09, 0.42 * vol, pan, 0.12, (tt) => {
    const w = rnd() * 2 - 1;
    // crude band-pass noise tick around 3.2 kHz
    const k = 0.42;
    b1 += k * (w - b1 - 0.35 * b2); b2 += k * b1;
    const tick = b1 * Math.exp(-tt / 0.0035) * 1.4;
    const tock = Math.sin(TAU * f * (1 - 0.18 * Math.min(1, tt / 0.02)) * tt) * Math.exp(-tt / 0.011);
    const body = Math.sin(TAU * (170 + 60 * p) * tt) * Math.exp(-tt / 0.02) * 0.55;
    return (tick + tock * 0.65 + body) * att(tt, 0.0003);
  });
}
function pop(t, p, vol = 1) {
  const pan = (rnd() - 0.5) * 0.9;
  const f0 = 420 + 260 * p;
  let ph = 0;
  voice(t, 0.16, 0.22 * vol, pan, 0.3, (tt) => {
    const f = f0 * (1 + 2.0 * (1 - Math.exp(-tt / 0.022)));
    ph += TAU * f / SR;
    return Math.sin(ph) * Math.exp(-tt / 0.038) * att(tt, 0.0015);
  });
}
function flame(t, vol = 1) {
  let last = 0;
  voice(t, 0.3, 0.10 * vol, (rnd() - 0.5) * 0.4, 0.25, (tt) => {
    const w = rnd() * 2 - 1; const hp = w - last; last = w;
    return hp * Math.exp(-tt / 0.07) * att(tt, 0.01);
  });
  voice(t, 0.12, 0.12 * vol, 0, 0.2, (tt) => Math.sin(TAU * 90 * tt) * Math.exp(-tt / 0.03));
}
function swoosh(t, vol = 1) {
  let a = 0, b = 0;
  voice(t, 0.6, 0.20 * vol, -0.3, 0.45, (tt) => {
    const w = rnd() * 2 - 1;
    const fc = 500 + 3200 * Math.pow(tt / 0.6, 1.3);
    const k = Math.min(0.9, 2 * Math.sin(Math.PI * fc / SR));
    a += k * (w - a - 0.6 * b); b += k * a;
    const env = Math.sin(Math.PI * Math.min(1, tt / 0.6)) ** 2;
    return b * env * 0.8;
  });
}
const PENTA = [1046.5, 1174.7, 1318.5, 1568.0, 1760.0, 2093.0];
function burst(t, vol = 1) {
  let lp = 0;
  voice(t, 0.7, 0.55 * vol, 0, 0.5, (tt) => {
    const f = 46 + 90 * Math.exp(-tt / 0.07);
    const w = rnd() * 2 - 1; lp += 0.06 * (w - lp);
    return (Math.sin(TAU * f * tt) * Math.exp(-tt / 0.16) + lp * 1.6 * Math.exp(-tt / 0.22) * att(tt, 0.02)) * att(tt, 0.002);
  });
  for (let i = 0; i < 6; i++) {
    const f = PENTA[Math.floor(rnd() * PENTA.length)] * (rnd() < 0.35 ? 2 : 1);
    musicBox(t + 0.04 + i * (0.045 + 0.02 * rnd()), f, 0.55 * vol, (rnd() - 0.5) * 1.4, 0.7);
  }
}
function glitter(t, p, vol = 1) {
  for (let i = 0; i < 3; i++) {
    const tt0 = t + (i + rnd()) * (1 / FPS / 3);
    const f = 3200 + rnd() * 3800;
    voice(tt0, 0.18, 0.055 * vol, (rnd() - 0.5) * 1.6, 0.8, (tt) => Math.sin(TAU * f * tt) * Math.exp(-tt / 0.045) * att(tt, 0.0004));
  }
}

// --- score: "Happy Birthday" in C, 4 lines x 24 exposures = 8 s ------------
const N_ = {G2: 98, C3: 130.81, F3: 174.61, G3: 196, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5};
const lines = [
  {t: 0,  box: false, n: [['G4', 3], ['G4', 1], ['A4', 4], ['G4', 4], ['C5', 4], ['B4', 8]]},
  {t: 24, box: false, n: [['G4', 3], ['G4', 1], ['A4', 4], ['G4', 4], ['D5', 4], ['C5', 8]]},
  {t: 48, box: true,  n: [['G4', 3], ['G4', 1], ['G5', 4], ['E5', 4], ['C5', 4], ['B4', 4], ['A4', 4]]},
  {t: 72, box: true,  n: [['F5', 3], ['F5', 1], ['E5', 4], ['C5', 4], ['D5', 4], ['C5', 8]]},
];
for (const L of lines) {
  let e = L.t;
  for (const [name, d] of L.n) {
    const f = N_[name];
    const humanise = (rnd() - 0.5) * 0.006;
    if (L.box) { musicBox(E(e) + humanise, f, 0.95, 0.25); marimba(E(e) + humanise, f / 2, 0.35, -0.2); }
    else marimba(E(e) + humanise, f, 1.0, -0.12);
    e += d;
  }
}
// marimba bass
[[0, 'C3'], [12, 'G2'], [24, 'C3'], [36, 'G2'], [48, 'C3'], [60, 'G2'], [72, 'F3'], [80, 'G2']].forEach(([e, n]) => marimba(E(e), N_[n], 0.7, -0.35, 0.3));
// sparkle counter-line on the long notes of lines 1-2
[[8, 'E5'], [16, 'G5'], [32, 'C6'], [40, 'G5']].forEach(([e, n]) => musicBox(E(e) + 0.02, N_[n], 0.45, 0.5));
// the "tada": final chord + rising music-box arpeggio into the last exposures
marimba(E(88), N_.C3, 0.9, -0.3, 0.4); marimba(E(88), N_.G3, 0.7, 0.1, 0.4);
['C5', 'G5', 'C6', 'E6'].forEach((n, i) => musicBox(E(88) + i * 0.085, N_[n], 0.85, -0.5 + i * 0.35, 0.75));
[1568, 1976, 2349, 2637, 3136].forEach((f, i) => musicBox(E(92) + i * 0.05, f, 0.35, (i - 2) * 0.35, 0.8));

// --- foley from the scene timeline ---------------------------------------
const byKey = new Map();
for (const s of sfxList()) {
  const key = `${s.type}:${s.e}`;
  const g = byKey.get(key) || {type: s.type, e: s.e, n: 0, v: 0, p: s.p};
  g.n++; g.v += s.v; byKey.set(key, g);
}
for (const g of byKey.values()) {
  if (g.e >= TOTAL) continue;
  const t = E(g.e) + (hashf(g.e, 4) - 0.5) * 0.012;
  const avg = g.v / g.n;
  if (g.type === 'click') {
    const k = Math.min(5, Math.ceil(Math.sqrt(g.n)));
    for (let i = 0; i < k; i++) click(t + i * (0.004 + 0.008 * hashf(g.e, i)), (g.p + i * 0.37) % 1, Math.min(1, avg * (k > 2 ? 0.7 : 0.95)));
  } else if (g.type === 'pop') pop(t, g.p, Math.min(1, avg));
  else if (g.type === 'flame') flame(t, avg);
  else if (g.type === 'swoosh') swoosh(t, avg);
  else if (g.type === 'burst') burst(t, avg);
  else if (g.type === 'glitter') glitter(t, g.p, avg);
}

// --- Schroeder reverb on the send bus -------------------------------------
function reverb(inp, off) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => d + off);
  for (const d of combs) {
    const buf = new Float32Array(d); let idx = 0, lp = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx];
      lp += 0.28 * (y - lp);
      buf[idx] = inp[i] + lp * 0.84;
      idx = (idx + 1) % d;
      out[i] += y / combs.length;
    }
  }
  for (const d of [225 + off, 556 + off, 441 + off]) {
    const buf = new Float32Array(d); let idx = 0;
    for (let i = 0; i < N; i++) {
      const z = buf[idx];
      const x = out[i] - 0.5 * z;
      buf[idx] = x; out[i] = z + 0.5 * x;
      idx = (idx + 1) % d;
    }
  }
  return out;
}
const wetL = reverb(sendL, 0), wetR = reverb(sendR, 23);
const outL = new Float32Array(N), outR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  outL[i] = dryL[i] + wetL[i] * 0.42;
  outR[i] = dryR[i] + wetR[i] * 0.42;
}
// gentle fade-in / fade-out, soft clip, normalise
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const f = Math.min(1, t / 0.01) * Math.min(1, (DUR - t) / 0.35);
  outL[i] = Math.tanh(outL[i] * 1.1) * f; outR[i] = Math.tanh(outR[i] * 1.1) * f;
  peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
}
const norm = 0.89 / peak;

const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outL[i] * norm)) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outR[i] * norm)) * 32767), i * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVEfmt ', 8);
hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
fs.mkdirSync(dir, {recursive: true});
fs.writeFileSync(path.join(dir, 'score.wav'), Buffer.concat([hdr, data]));
console.log(`score.wav written: ${DUR}s, peak before norm ${peak.toFixed(2)}, ${byKey.size} foley groups`);

import * as THREE from 'three';
import {hashf} from './scene.mjs';

function rng(seed: number) {
  let i = 0;
  return () => hashf(seed, i++, 17);
}

// Shared ABS surface maps: shade (dust, fingerprints, mould seam) and
// roughness (hairline scratches, fingerprint smears). Linear data textures.
export function makeAbsTextures() {
  const S = 512;
  const r = rng(11);
  const shade = document.createElement('canvas');
  shade.width = shade.height = S;
  const sc = shade.getContext('2d')!;
  sc.fillStyle = '#ffffff';
  sc.fillRect(0, 0, S, S);
  // slow mottling (slight shade differences)
  for (let i = 0; i < 40; i++) {
    const x = r() * S, y = r() * S, rad = 60 + r() * 140;
    const g = sc.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.012 + r() * 0.018;
    g.addColorStop(0, `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    sc.fillStyle = g;
    sc.fillRect(0, 0, S, S);
  }
  // mould seam line
  sc.fillStyle = 'rgba(0,0,0,0.16)';
  sc.fillRect(0, S * 0.5 - 1, S, 2);
  sc.fillStyle = 'rgba(255,255,255,0.10)';
  sc.fillRect(0, S * 0.5 + 1, S, 1);
  // dust specks
  for (let i = 0; i < 260; i++) {
    sc.fillStyle = `rgba(${r() < 0.7 ? '40,30,30' : '255,255,255'},${0.15 + r() * 0.3})`;
    const s = 0.6 + r() * 1.4;
    sc.fillRect(r() * S, r() * S, s, s);
  }
  // fingerprints (soft ovals with ridges)
  const fingers: number[][] = [];
  for (let i = 0; i < 7; i++) fingers.push([r() * S, r() * S, 26 + r() * 22, r() * Math.PI]);
  for (const [x, y, rad, rot] of fingers) {
    sc.save();
    sc.translate(x, y);
    sc.rotate(rot);
    sc.scale(0.75, 1);
    const g = sc.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    sc.fillStyle = g;
    sc.beginPath();
    sc.arc(0, 0, rad, 0, 7);
    sc.fill();
    sc.strokeStyle = 'rgba(0,0,0,0.05)';
    sc.lineWidth = 1;
    for (let k = 3; k < rad; k += 3.2) {
      sc.beginPath();
      sc.arc(0, 0, k, 0.3, 5.6);
      sc.stroke();
    }
    sc.restore();
  }

  const rough = document.createElement('canvas');
  rough.width = rough.height = S;
  const rc = rough.getContext('2d')!;
  rc.fillStyle = 'rgb(66,66,66)'; // base roughness ~0.26
  rc.fillRect(0, 0, S, S);
  for (let i = 0; i < 4000; i++) {
    const v = 55 + r() * 25;
    rc.fillStyle = `rgb(${v},${v},${v})`;
    rc.fillRect(r() * S, r() * S, 1.5, 1.5);
  }
  for (const [x, y, rad, rot] of fingers) {
    rc.save();
    rc.translate(x, y);
    rc.rotate(rot);
    rc.scale(0.75, 1);
    const g = rc.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, 'rgba(150,150,150,0.55)');
    g.addColorStop(1, 'rgba(150,150,150,0)');
    rc.fillStyle = g;
    rc.beginPath();
    rc.arc(0, 0, rad, 0, 7);
    rc.fill();
    rc.restore();
  }
  // hairline scratches
  for (let i = 0; i < 90; i++) {
    const x = r() * S, y = r() * S, len = 10 + r() * 70, a = r() * Math.PI;
    rc.strokeStyle = `rgba(${150 + r() * 90},${150 + r() * 90},${150 + r() * 90},${0.35 + r() * 0.5})`;
    rc.lineWidth = 0.6 + r() * 0.5;
    rc.beginPath();
    rc.moveTo(x, y);
    rc.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    rc.stroke();
  }
  const mk = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return {shade: mk(shade, true), rough: mk(rough, false)};
}

export function makeWoodTexture() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const r = rng(23);
  const planks = 8;
  const ph = H / planks;
  for (let p = 0; p < planks; p++) {
    const base = [150 + r() * 22, 98 + r() * 16, 62 + r() * 12];
    g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    g.fillRect(0, p * ph, W, ph);
    for (let i = 0; i < 160; i++) {
      const y = p * ph + r() * ph;
      const w = 0.6 + r() * 2.2;
      const d = r() < 0.5 ? -1 : 1;
      g.strokeStyle = `rgba(${d < 0 ? '60,30,14' : '220,170,120'},${0.05 + r() * 0.12})`;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(0, y);
      let yy = y;
      for (let x = 0; x <= W; x += 64) {
        yy += (r() - 0.5) * 2.2;
        g.lineTo(x, yy);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(30,12,4,0.55)';
    g.fillRect(0, p * ph, W, 2.5);
    // knots
    if (r() < 0.6) {
      const x = r() * W, y = p * ph + ph * (0.3 + r() * 0.4);
      for (let k = 6; k > 0; k--) {
        g.strokeStyle = `rgba(70,35,15,${0.18})`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(x, y, k * 7, k * 2.6, 0, 0, 7);
        g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

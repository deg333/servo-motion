import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {PARTS, hashf} from './scene.mjs';
import {makeAbsTextures} from './textures';

const GAP = 0.04;
const STUD_R = 0.29;
const STUD_H = 0.18;

const studGeo = () => new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 14, 1);

function merge(list: THREE.BufferGeometry[]) {
  const flat = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.clearGroups();
    return n;
  });
  return mergeGeometries(flat, false)!;
}

export function partGeometry(spec: any): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (spec.k === 'box') {
    const body = new RoundedBoxGeometry(spec.w - GAP, spec.h - 0.02, spec.d - GAP, 2, 0.05);
    body.translate(0, spec.h / 2, 0);
    parts.push(body);
    const stud = studGeo();
    for (let i = 0; i < spec.w; i++)
      for (let j = 0; j < spec.d; j++)
        parts.push(stud.clone().translate(-spec.w / 2 + 0.5 + i, spec.h + STUD_H / 2, -spec.d / 2 + 0.5 + j));
  } else if (spec.k === 'round') {
    const body = new THREE.CylinderGeometry(0.48, 0.48, spec.h - 0.02, 22, 1);
    body.translate(0, spec.h / 2, 0);
    parts.push(body, studGeo().translate(0, spec.h + STUD_H / 2, 0));
  } else if (spec.k === 'slope') {
    const {w, d, h} = spec;
    const shape = new THREE.Shape();
    shape.moveTo(0.02, 0);
    shape.lineTo(d - 0.02, 0);
    shape.lineTo(d - 0.02, h - 0.01);
    shape.lineTo(d - 1, h - 0.01);
    shape.lineTo(0.02, 0.4);
    shape.closePath();
    const ext = new THREE.ExtrudeGeometry(shape, {depth: w - GAP, bevelEnabled: false});
    ext.translate(0, 0, -(w - GAP) / 2);
    ext.rotateY(Math.PI / 2); // shape x -> -z, extrude -> +x
    ext.translate(0, 0, d / 2);
    parts.push(ext, studGeo().translate(0, h + STUD_H / 2, -d / 2 + 0.5));
  }
  return merge(parts);
}

// ABS plastic: clear-coat, soft-box reflections (via env map), subtle
// sub-surface glow (rim-lit self colour), per-instance glow + texture offset.
function absMaterial(opts: {translucent: boolean; maps: ReturnType<typeof makeAbsTextures>}) {
  const {maps, translucent} = opts;
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: maps.shade,
    roughness: translucent ? 0.12 : 1,
    roughnessMap: maps.rough,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: translucent ? 0.1 : 0.3,
    clearcoatRoughnessMap: maps.rough,
    envMapIntensity: 1.0,
    transparent: translucent,
    opacity: translucent ? 0.74 : 1,
    depthWrite: !translucent,
  });
  m.customProgramCacheKey = () => (translucent ? 'abs-t' : 'abs-o');
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nattribute vec2 aRand;\nvarying float vGlow;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
vGlow = aGlow;
#ifdef USE_MAP
vMapUv += aRand;
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv += aRand;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
vClearcoatRoughnessMapUv += aRand;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
  totalEmissiveRadiance += diffuseColor.rgb * (0.045 + 0.11 * fres + vGlow);
}`,
      );
  };
  return m;
}

type Entry = {mesh: THREE.InstancedMesh; glow: THREE.InstancedBufferAttribute; rand: THREE.InstancedBufferAttribute; max: number};

export function buildBricks(maxCounts: Record<string, number>) {
  const maps = makeAbsTextures();
  const opaque = absMaterial({translucent: false, maps});
  const trans = absMaterial({translucent: true, maps});
  const group = new THREE.Group();
  const entries: Record<string, Entry> = {};
  for (const key of Object.keys(maxCounts)) {
    const spec = (PARTS as any)[key];
    const max = Math.max(1, maxCounts[key] + 8);
    const geo = partGeometry(spec);
    const glow = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    const rand = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    glow.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aGlow', glow);
    geo.setAttribute('aRand', rand);
    const mesh = new THREE.InstancedMesh(geo, spec.t ? trans : opaque, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = !spec.t;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.setColorAt(0, new THREE.Color());
    group.add(mesh);
    entries[key] = {mesh, glow, rand, max};
  }
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const counts: Record<string, number> = {};

  function update(items: any[]) {
    for (const k in entries) counts[k] = 0;
    for (const it of items) {
      const en = entries[it.part];
      const i = counts[it.part]++;
      if (i >= en.max) continue;
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.rx, it.ry, it.rz, it.order || 'XYZ');
      dummy.scale.set(it.sx, it.sy, it.sz);
      dummy.updateMatrix();
      en.mesh.setMatrixAt(i, dummy.matrix);
      col.setHex(it.color);
      col.offsetHSL((hashf(it.id, 1, 5) - 0.5) * 0.012, (hashf(it.id, 2, 5) - 0.5) * 0.05, (hashf(it.id, 3, 5) - 0.5) * 0.07);
      en.mesh.setColorAt(i, col);
      en.glow.array[i] = it.glow;
      en.rand.array[i * 2] = hashf(it.id, 4, 5);
      en.rand.array[i * 2 + 1] = hashf(it.id, 5, 5);
    }
    for (const k in entries) {
      const en = entries[k];
      en.mesh.count = Math.min(counts[k], en.max);
      en.mesh.instanceMatrix.needsUpdate = true;
      if (en.mesh.instanceColor) en.mesh.instanceColor.needsUpdate = true;
      en.glow.needsUpdate = true;
      en.rand.needsUpdate = true;
    }
  }
  return {group, update};
}

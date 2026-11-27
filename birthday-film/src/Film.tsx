import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useFrame, useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {BokehPass} from 'three/examples/jsm/postprocessing/BokehPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {TABLE_Y, TOTAL, cameraAt, itemsAt} from './scene.mjs';
import {buildBricks} from './bricks';
import {makeWoodTexture} from './textures';

// Studio softbox environment for the clear-coat reflections.
function softboxEnv(gl: THREE.WebGLRenderer) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x2a0a16);
  const panel = (w: number, h: number, pos: number[], look: number[], i: number, c = 0xffeedd) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide}));
    m.position.set(pos[0], pos[1], pos[2]);
    m.lookAt(look[0], look[1], look[2]);
    s.add(m);
  };
  panel(14, 9, [-9, 12, 10], [0, 0, 0], 9); // big key softbox, upper left front
  panel(5, 14, [12, 4, 8], [0, 0, 0], 5, 0xffd9d0); // tall strip right
  panel(18, 3, [0, 14, -12], [0, 0, 0], 4); // top rim strip
  panel(10, 6, [0, 2, 14], [0, 0, 0], 1.5, 0xfff4ee); // soft fill front
  const pm = new THREE.PMREMGenerator(gl);
  const rt = pm.fromScene(s, 0.03);
  pm.dispose();
  return rt.texture;
}


// Disc-gather depth of field on the HDR buffer: round, creamy bokeh with no ghosting.
const DOF_FRAG = `
#include <common>
#include <packing>
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float maxblur;
uniform float aperture;
uniform float nearClip;
uniform float farClip;
uniform float focus;
uniform float aspect;
float getDepth(const in vec2 p){
  #if DEPTH_PACKING == 1
    return unpackRGBAToDepth(texture2D(tDepth, p));
  #else
    return texture2D(tDepth, p).x;
  #endif
}
float getViewZ(const in float d){
  #if PERSPECTIVE_CAMERA == 1
    return perspectiveDepthToViewZ(d, nearClip, farClip);
  #else
    return orthographicDepthToViewZ(d, nearClip, farClip);
  #endif
}
float coc(vec2 p){ return clamp(abs((focus + getViewZ(getDepth(p))) * aperture), 0.0, maxblur); }
void main(){
  float c0 = coc(vUv);
  vec4 centre = texture2D(tColor, vUv);
  if (c0 < 0.0006) { gl_FragColor = centre; return; }
  float rot = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec4 acc = centre; float ws = 1.0;
  const int N = 56;
  for (int i = 0; i < N; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / float(N));
    float a = fi * 2.39996323 + rot;
    vec2 off = vec2(cos(a), sin(a) * aspect) * r * c0;
    vec2 p = vUv + off;
    float sc = coc(p);
    float w = clamp(sc / max(r * c0, 1e-5), 0.0, 1.0);
    vec4 s = texture2D(tColor, p);
    acc += s * w; ws += w;
  }
  gl_FragColor = acc / ws;
}`;

const Stage: React.FC<{frame: number}> = ({frame}) => {
  const {gl, scene, camera, size} = useThree();
  const e = Math.min(TOTAL - 1, frame);
  const maxCounts = useMemo(() => {
    const mx: Record<string, number> = {};
    for (let i = 0; i < TOTAL; i++) {
      const c: Record<string, number> = {};
      for (const it of itemsAt(i)) c[it.part] = (c[it.part] || 0) + 1;
      for (const k in c) mx[k] = Math.max(mx[k] || 0, c[k]);
    }
    return mx;
  }, []);
  const rig = useMemo(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.background = new THREE.Color(0x12060b);
    scene.environment = softboxEnv(gl);
    (scene as any).environmentIntensity = 0.85;

    const key = new THREE.DirectionalLight(0xffd9ae, 2.8);
    key.position.set(-34, 52, 46);
    key.target.position.set(0, 8, -4);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    const sc = key.shadow.camera;
    sc.left = -62; sc.right = 62; sc.top = 52; sc.bottom = -52; sc.near = 10; sc.far = 170;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.04;
    scene.add(key, key.target);
    const hemi = new THREE.HemisphereLight(0xffd8d0, 0x401020, 0.35);
    scene.add(hemi);
    const rim = new THREE.DirectionalLight(0xff9fb0, 0.9);
    rim.position.set(30, 22, -20);
    scene.add(rim);

    // wooden table
    const wood = makeWoodTexture();
    wood.repeat.set(1.2, 1.2);
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 130),
      new THREE.MeshPhysicalMaterial({map: wood, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.45}),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.set(0, TABLE_Y, 20);
    table.receiveShadow = true;
    scene.add(table);

    const bricks = buildBricks(maxCounts);
    scene.add(bricks.group);

    const composer = new EffectComposer(
      gl,
      new THREE.WebGLRenderTarget(1920, 1080, {type: THREE.HalfFloatType, samples: 4}),
    );
    composer.setPixelRatio(1);
    composer.setSize(1920, 1080);
    const cam = camera as THREE.PerspectiveCamera;
    composer.addPass(new RenderPass(scene, cam));
    const bokeh = new BokehPass(scene, cam, {focus: 10, aperture: 0.005, maxblur: 0.02});
    (bokeh as any).materialBokeh.fragmentShader = DOF_FRAG;
    (bokeh as any).materialBokeh.needsUpdate = true;
    composer.addPass(bokeh);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(960, 540), 0.32, 0.7, 0.86));
    composer.addPass(new OutputPass());
    return {key, hemi, rim, bricks, composer, bokeh, cam};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a positive-priority subscriber switches R3F's own auto-render off; we render the composer ourselves
  useFrame(() => {}, 1);

  useLayoutEffect(() => {
    const handle = delayRender('stop-motion exposure ' + e);
    const cm = cameraAt(e);
    const {cam, key, hemi, rim, bricks, bokeh, composer} = rig;
    cam.fov = cm.fov;
    cam.near = 0.05;
    cam.far = 400;
    cam.aspect = 16 / 9;
    cam.position.set(cm.pos[0], cm.pos[1], cm.pos[2]);
    cam.lookAt(cm.look[0], cm.look[1], cm.look[2]);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    key.intensity = 2.8 * cm.key;
    hemi.intensity = 0.35 * cm.key;
    rim.intensity = 0.9 * cm.key;
    (scene as any).environmentIntensity = 0.85 * Math.min(1, cm.key * 1.05);
    (bokeh as any).uniforms['focus'].value = cm.focus;
    (bokeh as any).uniforms['aperture'].value = cm.aperture;
    bricks.update(itemsAt(e));
    composer.render();
    continueRender(handle);
  }, [e, rig, size.width]);

  return null;
};

export const Film: React.FC = () => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor: '#12060b'}}>
      <ThreeCanvas
        width={width}
        height={height}
        frameloop="demand"
        shadows
        dpr={1}
        gl={{antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'}}
        camera={{fov: 30, near: 0.05, far: 400, position: [0, 5, 30]}}
      >
        <Stage frame={frame} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

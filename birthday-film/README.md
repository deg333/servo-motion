# Sean's birthday — toy-brick stop-motion film (Remotion + three.js)

An 8-second, 16:9, 1920×1080 stop-motion film built entirely in code. No people,
no figures, no overlay text: everything — including the lettering and the number —
is built from a small generic brick system (1x1/1x2/2x2/2x4 bricks, plates a third
as high, slopes, round 1x1s, translucent pieces) on a fixed stud grid, drawn with
`InstancedMesh`.

* **Material** – glossy ABS: clear-coat reflections of a softbox, faint rim glow,
  hairline scratches, fingerprints, dust specks, mould seam lines, per-brick shade shifts.
* **Shot like tabletop stop motion** – studded baseplate on a wooden table in front of a
  brick-built backdrop, warm key light with per-exposure flicker, macro lens with shallow
  depth of field and bokeh, 12 exposures/s with position jitter and squash-and-settle,
  no motion blur. Effects (fireworks, flames, confetti) are bricks and studs that pop on/off.
* **Camera** – stud-level macro → wide finale.
* **Sound** – fully synthesised (`scripts/make-audio.mjs`): plastic click per brick,
  marimba + music-box "Happy Birthday", pops, whooshes, glitter.

```
src/scene.mjs   the whole film as data: catalogue, build orders, camera, sfx timeline
src/bricks.ts   geometry + ABS material (instanced)
src/Film.tsx    Remotion composition, lighting, depth of field, bloom
scripts/        audio synth + final mux (12 → 24 fps frame doubling)
```

```bash
npm install
npm run build          # audio -> render (12 fps exposures) -> out/sean-birthday.mp4
npm run studio         # preview in Remotion Studio
```

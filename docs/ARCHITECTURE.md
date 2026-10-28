# How it's built

No bundler, no framework, no backend. `index.html` loads `js/main.js` as an ES module and pulls Three.js from a CDN through an import map.

```
index.html            intro overlay, HUD, import map
css/style.css         HUD, letterbox, tooltips, intro
js/
  main.js             renderer, lights, camera rig, input, post-processing, boot
  screens.js          Sim (the dispatch world) + every screen drawn to a canvas texture
  props.js            desk, gauges, buttons, joystick, mug, helmet, radio...
  backdrop.js         the apparatus bay and city seen through the glass
  textures.js         procedural canvases: grime, brushed metal, panel paint, 7-segment
  audio.js            Web Audio synth: room tone, clicks, station tones, radio chatter
  dof.js              depth-of-field pass with bokeh-weighted highlights
  merge.js            collapses static meshes into one mesh per material
```

## The simulation

`Sim` in `screens.js` owns the whole world: a procedural city grid, a fleet of units (engines, ladders, rescues, a battalion chief, hazmat and medics), and a stream of incidents (structure, vehicle and brush fires, hazmat, medical, MVA, alarms). Incidents spawn, get dispatched, units route along streets, arrive, work the scene and are released. Every screen reads from the same `Sim`, so a dispatch on the map shows up in the fleet list, the CAD queue and the radio log at the same moment.

## Screens are textures

Each display is a `Screen`: an offscreen `<canvas>` painted at its own frame rate (about 15 fps) and uploaded as an emissive map on the monitor mesh. That keeps the 2D UI crisp, cheap to write, and lit by the same bloom as everything else in the room.

## Rendering

- `WebGLRenderer` with PCF soft shadows (re-rendered only when something moves)
- `RectAreaLight` for the monitors' spill light, spot lights for the desk lamp and bay
- environment map captured from the scene itself so glass and metal reflect the room
- post chain: `RenderPass` → depth of field → `UnrealBloomPass` → `OutputPass`
- static geometry is merged per material to keep draw calls down

## Audio

Everything is synthesised at runtime with Web Audio, with no samples: brown-noise room tone and HVAC hum, panel clicks, station alert tones, and radio chatter through a band-limited, soft-clipped bus.

## Debug hooks

`?auto` skips the intro button; `?auto&view=1` jumps straight to a screen; `?auto&fast` also skips all boot animations. `window.__cockpit` exposes `VIEWS`, `sim`, `camera`, `renderer`, `screens` and friends for the console.

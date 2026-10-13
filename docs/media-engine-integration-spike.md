# Media engine integration spike (D-Social)

Status: research-backed, isolated on `feat/fullscreen-media-core`. This document does not authorize or perform a production deployment.

## Findings

### 1. `Vincentwei1021/video-shotcraft`

- The Workbench is a separate Vite application using React 19, Remotion 4, Zustand and Three.js; its package is not a drop-in React component package for D-Social (React 18).
- Its most reusable ideas are the single project manifest, one source of truth for clip timing, normalized frame-based composition, and parity tests comparing the editable project against the final render.
- `@remotion/player` is a real-time preview player, not by itself a browser-side MP4 encoder. The repository's export path invokes the Remotion CLI in a Node environment. Importing its entire Workbench would bring a large dependency surface and assumptions about a local Node/dev server that do not exist in the D-Social phone browser.
- Remotion has its own licensing terms; evaluate those separately before using it in a commercial product.

Decision: borrow the manifest/timebase/parity architecture first. Do not add the whole Workbench or promise Remotion MP4 export in the browser. A separate Remotion render service would be a later, separately approved architecture decision; it would need to respect the no-cost/no-retention constraints and must not block posting.

### 2. `storytold/photocraft` and `storytold/artcraft-services`

- PhotoCraft's repository describes a Rust image editor with layers, masks, adjustment layers, text/vector layers and a WebAssembly build path. It is not a reusable React/TypeScript canvas component library.
- PhotoCraft's own code is marked MIT OR Apache-2.0, but it is early alpha and would require an evaluated WASM/engine boundary, build tooling, payload-size checks, and Android browser tests before adoption.
- The separate `storytold/artcraft-services` repository contains React/TypeScript web frontends, but its current `LICENSE.md` explicitly says the license is work-in-progress and restricts commercial use/competing products. Do not copy or vendor its webapp components into D-Social unless the project obtains clear, compatible permission.

Decision: do not import ArtCraft-webapp source into D-Social. For the current editor, use a small D-Social-owned layer model and canvas renderer. Evaluate PhotoCraft WASM separately only if it can be built and tested within the app's mobile bundle/performance budget.

## Incremental implementation order

1. Keep the current Fullscreen creator UI unchanged.
2. Introduce a D-Social-owned layer data contract: stable ID, kind, visible flag, normalized x/y, z-order, text/sticker value, font and color.
3. Preserve legacy `overlayText`/`sticker` settings through an adapter while preview and export are migrated together.
4. Add deterministic frame/time metadata and parity-oriented tests before any Remotion dependency is introduced.
5. Only then compare: current Canvas + MediaRecorder, a separately hosted Remotion renderer, and PhotoCraft WASM on a real Android device.

## Acceptance gates

- Existing post/story uploads still work without a new service.
- Preview and export agree on layer position, order, filter, trim and audio.
- Phone tests cover supported/unsupported MediaRecorder MIME types, a real output file, playback and upload.
- No production merge until preview is tested on Android and the user approves it.
- Never change `src/components/ShortVideoFeed.tsx` as part of this spike.

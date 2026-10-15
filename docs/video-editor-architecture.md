# D-Social Video Editor — Architecture & Integration Plan

## Scope

This document records the implementation direction for the D-Social in-app editor. It is not a claim that every listed capability is already implemented.

## Source projects reviewed

- [FairArena/fairarena-video](https://github.com/FairArena/fairarena-video) — MIT licensed; broad browser-native editing reference with multi-track media, transforms, text, effects, audio, and export. Its stated WebGPU/WebCodecs requirements and beta status mean it should not be copied wholesale into the mobile-first D-Social editor without compatibility testing.
- [ys941/reelstudio](https://github.com/ys941/reelstudio) — MIT licensed; useful reference for a mobile/social editing workflow, Canvas preview, timeline, overlays, transitions, and browser export.
- [Ektie/react-video-timeline-editor](https://github.com/Ektie/react-video-timeline-editor) — AGPL-3.0; not selected for direct code reuse because its network-service/source-disclosure obligations need a deliberate licensing decision.

The editor should preserve D-Social's React 18 + Vite + TypeScript + Tailwind stack and Supabase publishing flow. Reuse patterns and compatible MIT components only after checking each file's license and dependency requirements; preserve copyright/license notices for any copied code.

## Target module boundaries

1. **Media import** — multiple images, multiple videos, and audio; validate MIME/size; show import errors; do not silently discard selected files.
2. **Asset library** — object URL lifecycle, media metadata, thumbnails, duration, dimensions, and local draft asset references.
3. **Project model** — serializable project, asset IDs, timeline tracks, clip in/out, transforms, effects, text, audio, frame rate, and aspect ratio. Keep browser File/Blob objects outside the serializable JSON model.
4. **Timeline engine** — multiple video/image/audio/text tracks; selection; drag/reorder; trim; split at playhead; duplicate; delete; zoom/fit; snapping; ripple operations; undo/redo.
5. **Preview renderer** — deterministic timeline time mapping; preview the active clip/track; crop/fit; text/overlay layers; transforms; transitions; synchronized audio.
6. **Audio engine** — source audio, independent music/voiceover tracks, gain, mute, fades, and a mixed export stream.
7. **Export engine** — browser capability detection; export progress/cancel; audio/video muxing; output format and quality selection; clear failure messages; test small files before high-resolution exports. Avoid promising MP4 if the current browser encoder only supports WebM.
8. **Draft persistence** — IndexedDB for large local media/drafts, optional Supabase project metadata, never store large media blobs in ordinary localStorage.
9. **D-Social integration** — pass exported File/Blob to the existing composer/publish flow; preserve current permissions and post/story validation.
10. **QA and accessibility** — unit tests for timeline math; import/export tests for image-only, video-only, mixed media, multiple videos, audio, and long projects; Android Chrome tests; memory/object-URL cleanup.

## Current branch change

The current change removes the explicit one-video limit in the picker and append handler, so a selection can contain multiple images and multiple videos. The exporter now creates a Web Audio mix bus, routes each source video's audio through the original-volume gain, routes uploaded background music through its own gain, supports music fade-in/fade-out, and adds the mixed audio track to the MediaRecorder stream. The UI also exposes resolution, frame rate, bitrate, and browser-capability-aware WebM/MP4 selection, plus horizontal mirror. These changes still need browser/device regression tests; do not treat them as production-verified until exports are checked on Android Chrome.

## Acceptance checklist before production

- [ ] Select several images and several videos in one picker action.
- [ ] Add more media later without losing current timeline clips.
- [ ] Preview every clip in the correct order and duration.
- [ ] Split/trim/reorder/delete without desynchronizing media.
- [ ] Export mixed image/video timeline and verify every segment appears.
- [ ] Verify original video audio and music are actually present in export.
- [ ] Test on Android Chrome with short and large files; handle memory pressure.
- [ ] Confirm output MIME/extension match the actual encoded format.
- [ ] Run typecheck, build, and automated tests before merging.


## CapCut-like implementation sequence

### Phase A — media/timeline and audio export foundation
- [x] Multi-select image and video files in one picker; append later imports without replacing existing clips.
- [x] Full-screen mobile-first editing workspace with tool sheets for trim, music, text, stickers, filters, adjustment, aspect ratio, and background.
- [x] Timeline clip selection, basic reorder/delete/split/trim, image duration, text overlay, duplicate clip, splitting image clips, and clip-edit undo/redo history (bounded to 50 steps).
- [x] Export engine routes source-video audio and uploaded background music into a mixed MediaRecorder audio track with independent gain settings.
- [ ] Verify exported audio is audible and synchronized for image-only, video-only, and mixed image/video projects on Android Chrome.
- [ ] Add deterministic unit tests for timeline duration/trim/split math and browser export smoke tests.

### Phase B — editor interaction
- [ ] Timeline zoom/fit, drag-and-drop clip reorder, snapping, and ripple delete.
- [ ] Separate video, image, text, music, and voiceover tracks with track mute/lock/visibility.
- [ ] Keyboard-accessible controls and touch-target regression tests.

### Phase C — visual editing
- [x] Basic global crop/position/scale/rotation/mirror, fit/fill, filter, color-adjustment, background, and sticker controls; current canvas export renders these settings.
- [ ] Per-clip transforms and multiple text/sticker overlays with independent start/end times.
- [ ] Transitions, speed controls, and keyframe-based animation.

### Phase D — persistence and delivery
- [ ] Save/load project metadata and timeline to IndexedDB; keep large blobs out of localStorage.
- [x] Export resolution/frame-rate/bitrate controls, browser format selection, and MIME/extension mapping for the browser's actual encoder.
- [ ] Export progress/cancel, capability regression tests, and Android verification.
- [ ] Verify composer and Story publishing integration without changing unrelated feed/chat behavior.

## License and reuse decision
The licenses were checked in the upstream repositories: [FairArena/fairarena-video](https://github.com/FairArena/fairarena-video/blob/main/LICENSE) and [ys941/reelstudio](https://github.com/ys941/reelstudio/blob/main/LICENSE) each expose an MIT license. They are references for architecture and interaction patterns in this phase; no upstream source files have been vendored wholesale. [Ektie/react-video-timeline-editor](https://github.com/Ektie/react-video-timeline-editor) remains excluded from direct reuse until its AGPL-3.0 implications are explicitly reviewed.


## Audit of the requested nine CapCut-like function layers

Status reflects the current feature branch, not the production `main` branch.

| Layer | Current status | Remaining gaps |
|---|---|---|
| 1. Media library and assets | **Partial** — import multiple images/videos, add background audio, and use local files | No searchable stock library, licensed music/SFX catalogue, templates, cloud asset browser, or collection management |
| 2. Timeline and multi-track | **Partial** — ordered clip sequence, trim/split/delete/reorder/duplicate, image duration, undo/redo | Not a true independent multi-track compositor; no overlay/video/audio/subtitle track hierarchy, freeze frame, speed curve, optical flow, snapping, ripple editing, or timeline zoom/fit |
| 3. Visual/media editing | **Basic** — crop fit/fill, zoom/pan, rotation, horizontal mirror, background and color adjustments | No chroma key, automatic background removal, masks, stabilization, denoise, sharpening, or lens correction |
| 4. Effects and filters | **Basic** — a few rendered color presets | No transition library, motion/lens/distortion effects, body/face AI effects, or timed per-clip effects |
| 5. Text and captions | **Basic** — one global text overlay with editable style/position | No multiple independently timed text layers, subtitle tracks, auto-caption speech recognition, text templates, or integrated text-to-speech/voice changer |
| 6. Audio | **Partial** — imported background music, original/music volume, export mix bus, music fade-in/fade-out | No stock SFX/BGM browser, independent voiceover tracks/recording, beat detection, noise reduction, voice effects, or per-clip audio automation |
| 7. Keyframes and animation | **Not implemented** beyond static transforms | No position/scale/rotation/opacity keyframes, animation presets, or motion tracking |
| 8. AI tools | **Not implemented** in the editor; unavailable tools are labelled instead of simulated | No text-to-video, AI enhancement/upscaling, auto-reframe/highlights, background removal, or face/body AI tools |
| 9. Export and sharing | **Partial** — resolution, FPS, bitrate and browser-supported format choice; existing composer/Story callbacks | GIF export unavailable; MP4 depends on browser encoder support; no verified 2K/4K Android exports, cancel/progress UI, direct TikTok/YouTube/Facebook/Instagram integrations, or device QA |

### Acceptance rule

Do not mark a capability complete because a button exists. It counts as implemented only when it changes the project state, is rendered in preview/export where relevant, has a clear unsupported/error state, and passes automated plus Android device testing. AI, cloud stock assets, platform sharing, and codec-dependent formats require a real service/API or capability check; they must not be represented by fake controls.

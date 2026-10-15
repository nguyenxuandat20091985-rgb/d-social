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

The current change removes the explicit one-video limit in the picker and append handler, so a selection can contain multiple images and multiple videos. The exporter now creates a Web Audio mix bus, routes each source video's audio through the original-volume gain, routes uploaded background music through its own gain, and adds the mixed audio track to the MediaRecorder stream. This implementation still needs browser/device regression tests; do not treat the feature as production-verified until mixed-media exports are checked on Android Chrome. Robust undo/redo, full multi-track compositing, transitions, voiceover recording, fades, and Android export regression coverage remain separate work.

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
- [x] Basic global crop/position/scale/rotation, fit/fill, filter, color-adjustment, background, and sticker controls; current canvas export renders these settings.
- [ ] Per-clip transforms and multiple text/sticker overlays with independent start/end times.
- [ ] Transitions, speed controls, and keyframe-based animation.

### Phase D — persistence and delivery
- [ ] Save/load project metadata and timeline to IndexedDB; keep large blobs out of localStorage.
- [ ] Export quality/frame-rate controls, progress/cancel, codec capability checks, and correct MIME/extension mapping.
- [ ] Verify composer and Story publishing integration without changing unrelated feed/chat behavior.

## License and reuse decision
The licenses were checked in the upstream repositories: [FairArena/fairarena-video](https://github.com/FairArena/fairarena-video/blob/main/LICENSE) and [ys941/reelstudio](https://github.com/ys941/reelstudio/blob/main/LICENSE) each expose an MIT license. They are references for architecture and interaction patterns in this phase; no upstream source files have been vendored wholesale. [Ektie/react-video-timeline-editor](https://github.com/Ektie/react-video-timeline-editor) remains excluded from direct reuse until its AGPL-3.0 implications are explicitly reviewed.

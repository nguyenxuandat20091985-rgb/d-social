# D-Social Media Processing Service — Quality-first redesign

## Status and release policy

Implementation status (2026-10-11): isolated preview deployment created at https://d-social-media-quality-preview.onrender.com. Automated tests are now part of the preview build via prebuild; their result must be checked on the latest deployment before claiming pass. Real-device visual acceptance remains pending. This preview is not production and must not be merged or enabled for production without explicit owner approval.

- Work branch: `feat/media-processing-quality-redesign`.
- This branch is isolated from the production branch. Do not merge it or change production deployment settings until the release gates in this document pass and the owner explicitly approves.
- The current adaptive preview service is not evidence that logo removal quality is acceptable. A successful build or HTTP 200 is not a visual-quality pass.
- Never report a file as cleaned when no logo region was confidently identified or when the output has not been inspected.

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 — isolation | Complete | Dedicated feature branch and separate Render preview; production untouched |
| 1 — safety/test harness | Initial gate passed | Node regression suite runs through npm prebuild; latest Render build succeeded |
| 2 — image pipeline | Prototype ready for acceptance | Detection/restoration separated; candidate review before restore; LaMa route on qualifying devices; weak-device interpolation is clearly labeled and not silently selected |
| 3 — video pipeline | Prototype ready for acceptance, quality incomplete | Three-point sampling, visible candidate boxes, user-drawn static region, output decode check; still uses fixed-region delogo rather than temporal AI inpainting/tracking |
| 4 — real-device QA | Pending owner test | Requires representative media and real Android/iOS/desktop browsers |
| 5 — production review | Not started by design | No production merge/deploy until visual acceptance and explicit approval |

## Goals

1. Support Android, iOS, and desktop browsers with one responsive interface.
2. Prioritize visual quality and user control over speed.
3. Keep the processing service independently deployable and loosely coupled to D-Social.
4. Prefer on-device/open-source processing to avoid per-request AI API fees and unnecessary uploads.
5. Fail safely: preserve the original, show uncertainty, allow cancellation, and never silently publish the processed result.

## Non-goals / honest limits

- No method can reconstruct original pixels hidden behind a logo with certainty.
- Free/open-source software does not guarantee zero hosting, bandwidth, storage, or device compute cost; model licenses and redistribution terms must be checked before bundling.
- OCR alone detects text, not every pictorial logo. Corner-only detection is not a general logo detector.
- FFmpeg's `delogo` filter interpolates from surrounding pixels and is not a high-quality general-purpose video inpainting engine.
- Device RAM/CPU/WebGPU signals are approximate and must not be treated as guaranteed capacity.

## Target architecture

### Client
- Responsive upload/editor for image and video; local object URLs only; revoke temporary URLs on replacement/unmount.
- A shared processing job contract: queued -> analyzing -> needs-review -> processing -> validating -> complete/failed/cancelled.
- Show confidence and region overlays; allow multi-region selection, brush/rectangle mask, zoom/pan, undo/redo, before/after comparison, and an explicit confirmation before export.
- Device capability probe is advisory only. Bound image dimensions, video duration, file size, worker runtime, and memory-heavy allocations. Cancellation must terminate workers/FFmpeg and release temporary resources.

### Image pipeline
1. Decode and normalize orientation/color without modifying the original.
2. Candidate detection: OCR/text boxes plus visual heuristics; optionally a separately licensed logo detector if validated.
3. Human review: users can add/remove/refine regions; automatic removal must not proceed on low confidence without consent.
4. Mask generation: expand around antialiased edges, feather only when appropriate, preserve nearby foreground objects.
5. Restoration strategies, in order of suitability:
   - local patch/interpolation for tiny, low-texture regions;
   - LaMa-style inpainting for suitable masks and devices, with model license/size and runtime verified;
   - optional server-side open-source inference only if separately configured, authenticated, rate-limited, and cost-bounded.
6. Validate output decode, dimensions, orientation, and format; compare preview; retain original for undo.

### Video pipeline
1. Probe codec, dimensions, frame rate, duration, audio streams, and orientation.
2. Sample multiple time points (not only the first frame); detect candidates and estimate whether region is static or moving.
3. Provide a timeline/frame scrubber and editable mask/region; for moving logos, track the region or let users keyframe it.
4. Process bounded frame batches with temporal consistency. Reuse image inpainting only where practical; avoid assuming a static FFmpeg `delogo` rectangle is suitable for every video.
5. Encode with explicit audio mapping, timestamps, rotation, aspect ratio, and supported codec settings; keep the original audio unless the user chooses otherwise.
6. Validate by decoding the complete output and sampling frames across the whole duration. Detect missing audio, black frames, frame-size changes, excessive duration drift, and output truncation.

### Service boundary
- Keep the editor/service on its own route and deployment. D-Social integration must use a narrow API contract and must not change unrelated feeds, authentication, messaging, or posting flows.
- No media is sent to a server unless a clearly disclosed, authenticated opt-in server mode is implemented.
- Use open-source dependencies only after checking license, model redistribution terms, browser compatibility, bundle size, and maintenance status.

## Delivery phases and gates

### Phase 0 — Baseline and isolation
- Create this isolated redesign branch.
- Record current limitations and deployment boundaries.
- Capture baseline builds and sample media results; production remains untouched.
- Gate: branch isolation confirmed; owner can open the test preview; no production merge/deploy.

### Phase 1 — Correctness and test harness
- Add repeatable unit tests for coordinate transforms, mask bounds, media metadata, output validation, cancellation, and error paths.
- Build a labeled acceptance corpus covering: corner/text/pictorial logos; transparent and opaque logos; light/dark/busy backgrounds; moving/static logos; 9:16, 16:9, and 1:1; low/high resolution; video with/without audio.
- Define quality scoring: residual logo visibility, background distortion, edge halos, temporal flicker, audio preservation, output integrity, memory/time, and failure messaging.
- Gate: TypeScript/build and automated tests pass; no false “success” state on errors.

### Phase 2 — Image quality-first pipeline
- Separate detection, region editing, mask generation, restoration, and output validation into independently testable modules.
- Support multiple regions and manual correction before export.
- Compare classical patching and LaMa inpainting on the same acceptance corpus; select by measured quality and device constraints, not marketing claims.
- Gate: no production use until every test category has documented visual review and no critical corruption/privacy issue.

### Phase 3 — Video pipeline redesign
- Replace single-frame corner-only detection as the general strategy.
- Add multi-time sampling, region review, static/moving-region handling, cancellation, audio/metadata preservation, and full-output validation.
- Test short/long clips, variable frame rates, rotation, no-audio/audio, different codecs, moving logos, and low-memory devices.
- Gate: no export marked successful until complete output validation passes; visually review representative frames across the timeline.

### Phase 4 — Cross-device QA and performance
- Test real Android Chrome, iOS Safari, and desktop Chromium/Firefox/Safari where available.
- Test weak-device memory pressure, tab backgrounding, interrupted processing, low storage, unsupported formats, and large files.
- Verify accessibility, responsive layout, keyboard use, progress, retry, and cancellation.
- Gate: device matrix and known limitations documented; no unbounded memory growth or unhandled worker failures.

### Phase 5 — Staging integration and release review
- Deploy only to a separate staging/preview service.
- Verify the D-Social integration contract without enabling it for production users.
- Run regression tests for unaffected D-Social areas and security/privacy checks.
- Gate: automated checks pass, acceptance results reviewed, rollback plan prepared, and owner explicitly approves production release.

## Acceptance criteria (minimum)

- No production changes before explicit approval.
- All automated tests and TypeScript/build checks pass.
- Original file remains recoverable; cancellation does not leave workers or FFmpeg running.
- Output dimensions/aspect ratio/orientation are correct; video audio is preserved when present.
- No silent success when detection, processing, or output validation fails.
- Visual results are reviewed on representative media from every corpus category. Publish measured failures/limitations rather than promising perfect removal.
- No unrequested server upload and no secret/token exposed in client code.

## Current known gaps to resolve

- Video now samples three time points, displays OCR candidate boxes, and requires the user to review/drag a region before processing. Restoration still uses FFmpeg delogo with one static rectangle for the whole clip. It does not track a moving logo or guarantee temporal consistency; a higher-quality frame inpainting/tracking engine remains future work.
- Image detection is separated from restoration and requires explicit confirmation. On devices that do not qualify for the LaMa route, automatic restoration refuses to silently select the low-quality interpolation fallback; manual mode labels the fallback as experimental.
- Automatic image candidates are still OCR/corner heuristic results. They may include ordinary corner text and may miss icon-only, central, translucent, or stylized logos. Users must inspect the candidate list or use manual masks.
- The preview build and automated tests must be checked on the latest commit. Real Android/iOS/desktop acceptance and visual scoring require actual sample media and devices; those results cannot be inferred from source code or deployment status.
- The acceptance matrix and scoring form are in docs/media-processing-acceptance-checklist.md.

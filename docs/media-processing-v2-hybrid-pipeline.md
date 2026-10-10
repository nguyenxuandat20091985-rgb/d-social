# D-Social Media Processing Service v2 — Hybrid Pipeline

## Status

Design and implementation checklist. This document does not claim that any model or pipeline below is already integrated. Production publishing must remain disabled until the acceptance gates pass.

## Goals

- Detect text watermarks and icon/logo marks, not OCR text alone.
- Process still images and videos through separate asynchronous pipelines.
- Keep user media on-device by default; no mandatory paid inference API.
- Return explicit states: detected, edited, quality-checked, needs-review, failed. Never label media clean just because detection returned no candidates.
- Keep the existing D-Social publishing path isolated until real-device tests pass.

## Proposed technology stack

### Image pipeline

1. **Preflight and image decode** — browser APIs (createImageBitmap, Canvas), file/dimension limits, EXIF/orientation checks, SHA-256, cancellation.
2. **Text detection/OCR** — replace single-pass Tesseract-only detection with a pluggable OCR adapter. Evaluate PaddleOCR/PP-OCRv4 or v5 (text detector + recognizer) as the high-accuracy baseline. Browser deployment requires verified ONNX/WebAssembly model assets and bundle-size/performance tests; do not load a large model before a user chooses automatic cleanup.
3. **Logo/object detection** — a separate ONNX Runtime Web detector, ideally YOLO-family, trained/evaluated on actual watermark/logo examples. OCR cannot detect icon-only marks. A generic pretrained object detector is not a watermark detector; do not ship one as if it were.
4. **Classical CV proposal stage** — OpenCV.js or small Canvas algorithms for edge/chroma/connected-component proposals. Use it to propose regions only, never to declare a region a logo by itself.
5. **Candidate fusion** — merge OCR, learned detector, temporal video proposals and CV proposals with bounding-box overlap, confidence thresholds, corner priors, and an explicit review threshold. Show the user low-confidence candidates rather than silently painting them.
6. **Removal** — preserve manual mask editing. Offer separate removal backends behind one interface:
   - fast local patch/edge-aware interpolation for small, low-texture areas;
   - a validated LaMa-family inpainting model through ONNX/WebGPU/WASM where device capability and license allow;
   - optional self-hosted server inference only if separately approved and operationally funded.
   A blur or crop is not generative removal and must not be presented as such.
7. **Quality gate** — compare dimensions, alpha, output decodability, file size, candidate coverage and mask boundaries; require preview/approval where visual quality cannot be scored reliably.

### Video pipeline (separate from image pipeline)

1. Probe container/codec/duration/resolution and estimate memory/processing cost before loading FFmpeg.
2. Extract representative frames at a low-cost cadence; run the same detector adapters on frames, then merge detections across time.
3. Track candidate regions across adjacent frames; smooth box coordinates and confidence so logos that move/fade do not flicker in and out.
4. Let the user review a timeline and edit a mask/region. Support static-logo and moving-logo cases as distinct modes.
5. Apply a time-consistent mask and removal strategy. FFmpeg crop is a user-selectable fallback, never the default detector or a guarantee.
6. Encode in a dedicated worker where supported; preserve rotation, aspect ratio, frame rate, audio streams and timestamps. Verify output can be decoded and audio is present when input had audio.
7. Show independent video queue/progress/cancel/retry states. Do not block image processing while video models or FFmpeg load.

## Runtime and speed strategy

- Lazy-load model/WASM assets only after the relevant action; cache verified assets with versioned URLs.
- Reuse one initialized worker/model instance per pipeline where safe; avoid multiple simultaneous OCR passes on full-resolution canvases.
- Detect on bounded, orientation-correct thumbnails/regions, then map coordinates back to original pixels.
- Use device capability checks to choose WebGPU, WebAssembly SIMD, or manual/worker fallback. Never require WebGPU.
- Bound concurrency and memory; process video frame batches instead of retaining every decoded frame.
- Support cancellation at decode, inference, mask, and encode stages. Release ImageBitmap, object URLs, FFmpeg virtual files and workers on completion/cancel.
- Record non-sensitive timing metrics locally: model load, detection, removal, encode, dimensions and result state. Do not upload media or telemetry by default.

## Recommended integration order

### Phase A — stabilize the contract
- Define common candidate, mask, progress, cancellation, output and error types.
- Keep image and video entry points separate.
- Add tests for no-candidate vs failed-detection vs confirmed-clean states.
- Fix existing output naming/MIME mismatches and verify output decodability.

### Phase B — improve detection
- Build a small evaluation set of consented sample images/videos covering text, icon-only logos, transparent marks, busy backgrounds, all corners, center overlays, moving overlays and no-logo negatives.
- Measure precision/recall, false-positive rate, detection latency and model download size.
- Compare PaddleOCR against current Tesseract on the same set.
- Add a logo detector only after selecting a suitable model and validating its license, class coverage, runtime, and false positives. Do not claim universal detection without this benchmark.

### Phase C — improve removal
- Benchmark the current local diffusion editor against a licensed LaMa-family model on the evaluation set.
- Compare artifacts, edge seams, time, memory, browser support and download size.
- Keep manual mask as an explicit fallback and require preview before the output can be used for publishing.

### Phase D — video
- Add frame sampling, temporal candidate merging/tracking, mask review, separate worker queue and audio/rotation/output checks.
- Test short clips first, then long/high-resolution clips on real Android and iOS devices.

### Phase E — controlled D-Social integration
- Integrate behind a feature flag in a dedicated branch.
- Do not auto-publish a processed file. User must review and approve the output.
- Enable wider rollout only after CI, desktop browser, Android Chrome/PWA and iOS Safari/PWA acceptance passes.

## Acceptance gates (must pass before production)

- Test set contains logo-positive and no-logo negative samples; publish measured precision/recall and false-positive rate.
- No candidate is not treated as proof that a file is clean.
- A failed detector never silently falls back to the original file as a clean output.
- Image dimensions/orientation are preserved; video aspect ratio, rotation, frame rate and audio are checked.
- Cancellation releases workers and temporary resources.
- Mobile tests cover low-memory behavior, model loading, slow network, offline after asset cache, and large-file rejection.
- Production publishing feature flag remains off until all gates are signed off.

## Cost and deployment policy

- Default path is local/on-device and does not send source media to a remote inference provider.
- Public free-tier inference endpoints are not a reliability guarantee and must not be a hidden dependency.
- Any server-side model needs explicit approval, cost limits, authentication, queueing, retention rules, and an operational owner before use.
- Model weights, source, runtime libraries and redistribution terms must be reviewed before bundling or hosting them.

## Known current gaps to resolve

- Current OCR flow uses Tesseract and corner-focused heuristics; it is not a general logo detector.
- Current image cleanup uses blur for OCR boxes and lightweight local pixel diffusion for manual masks, not a generative inpainting model.
- Current video path crops edges and re-encodes with FFmpeg.wasm; it does not detect or track logos.
- The existing feature branch is a test flow, not approved production integration.

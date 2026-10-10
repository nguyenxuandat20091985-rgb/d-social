# AI watermark fallback roadmap (proposal)

## Current state (2026-10-10)

The live Render service `d-social-media-processing` runs on Render's Free plan with FastAPI, OpenCV, Tesseract OCR and FFmpeg. It does **not** currently include Florence-2 or LaMa model weights. OCR + classical inpainting is best-effort and cannot reliably detect icon-only, translucent, animated, or background-matched TikTok marks.

The test UI and production media endpoint are separate. Do not enable experimental AI inference on production publishing until model inference, output validation, resource limits and failure behavior have been tested.

## Client lane: inexpensive mobile attempt

1. Decode a local image and inspect its dimensions/MIME/size.
2. Crop all four corner regions (each approximately 34% width × 26% height).
3. Upscale each crop to make small marks more legible; run grayscale/contrast enhancement and a thresholded variant before Tesseract.
4. Lower OCR confidence only for candidate extraction. A low-confidence OCR hit is not proof of a watermark; constrain candidates to corners, known wordmarks/handles, and plausible box sizes.
5. Preserve the original until a candidate is reviewed/processed. Report client success only when output generation succeeds; never interpret “no OCR text found” as “no watermark.”
6. If no credible candidate is found or processing errors, send the original through the authenticated server fallback only after explicit rights confirmation.

## Server lane: staged model-assisted fallback

### Phase A — harden the current fallback

- Keep Supabase JWT validation, per-user Storage path validation, upload limits, request timeout and fail-closed behavior.
- Improve corner OCR with CLAHE/grayscale/adaptive threshold and upscaling only for small crops.
- For video, process sampled frames to locate a mark, then propagate/interpolate the mask through nearby frames; verify frames across the clip.
- Use FFmpeg to encode the cleaned video stream. Prefer `-c:a copy` for the original audio stream; fall back to AAC only when the input audio codec cannot be muxed into MP4. Report which path was used.
- Never silently return or publish the original as a cleaned result. OCR verification is only a partial signal, not proof of zero remaining marks.

### Phase B — isolated Florence-2 + LaMa worker (not enabled yet)

Run this as a separate Python/FastAPI worker rather than adding PyTorch and model weights to the current free Render container.

Proposed internal contract:
- `POST /v1/detect`: accept an image/frame and return normalized watermark boxes, confidence, model version and timing.
- Florence-2 proposes candidate regions; a bounded mask expands each candidate to cover shadow/outline.
- LaMa inpaints only the proposed mask. Reject empty, out-of-bounds, oversized or low-confidence masks. Keep the original bytes for rollback.
- `POST /v1/process-image`: return a processed image plus hash, dimensions, model version and validation report.
- `POST /v1/process-video`: extract frames with FFmpeg, detect on representative frames, track/interpolate masks, inpaint affected frames, then mux the result with the original audio stream where codec/container compatibility permits.
- Run output checks (decode success, dimensions, duration, frame count, audio stream presence, hashes, OCR/vision recheck) and mark status as `processed`, `partial`, or `failed`. Only `processed` can be offered as cleaned; uncertain output remains unapproved.

### Phase C — resource and rollout gate

Before selecting a host, benchmark the exact model revisions and weights for RAM/VRAM, cold start, per-image latency, video FPS, model download/cache size and concurrent jobs. The current service is on Render Free and is not a safe assumption for Florence-2 + LaMa inference; use a GPU-capable worker or a separately budgeted machine if CPU/RAM tests fail. Keep this lane disabled by default until benchmarks and representative tests pass.

Pin dependency/model revisions, verify upstream licenses for both code and weights, keep model URLs/hashes fixed, add authentication between services, rate limits, temporary-file cleanup, per-user quotas, request IDs, timeout/cancellation, and redact tokens from logs.

## Acceptance tests

- Mobile test set: four corners, low contrast, translucent white/black text, small handles, different aspect ratios, compression artifacts, and non-watermark corner text (false-positive checks).
- Server image tests: known wordmark, icon-only logo, noisy background, image with no watermark, corrupt/oversized input, and output verification rejection.
- Video tests: fixed and moving logos, logo appearing/disappearing, no-logo clips, variable frame rate, silent clips, multiple audio streams, and source audio preservation.
- Verify the original is never reported as clean after any detection/inpainting/verification failure.

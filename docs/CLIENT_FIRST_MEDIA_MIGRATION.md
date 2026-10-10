# D-Social client-first media migration

## Scope and safety contract

This migration is isolated to media processing. Do not change feed, chat, discovery,
profiles, notifications, story expiration, database schema, or unrelated storage
policies as part of this work.

The existing Supabase Edge Function + Render processor remains the authoritative
fallback until the client processor has passed real-device acceptance tests.
A client-side preflight, successful OCR run, or hash calculation is NOT proof that
all brand logos were detected or removed. Never publish the original as if it were
cleaned after a processing failure.

## Current architecture (verified from source)

- Frontend: React 18 + TypeScript + Vite, deployed as a web app/PWA.
- Feed uploads call `processUploadedMedia()` when `VITE_MEDIA_PROCESSING_ENABLED=true`.
- Story uploads currently use a separate direct Storage upload path and do not call
  `processUploadedMedia()`.
- Supabase Edge Function `process-media` authenticates the user, invokes the private
  media service, validates output size/hash and stores the processed object.
- Render media service uses OpenCV, Tesseract OCR and FFmpeg. Current logo detection
  is best-effort OCR over corner regions; it is not a universal logo detector.

## Rollout phases

1. **Client foundation** — isolated worker protocol, input validation, progress,
   cancellation, resource release, and input fingerprinting.
2. **Client cleanup engine (partial implementation)** — browser OCR with Tesseract.js
   looks for text-like marks in the four corner regions of still images, then blurs
   bounded candidate boxes and hashes the output. This is deliberately conservative.
   It does not detect icon-only marks, moving video marks, central marks, or guarantee
   that recognized corner text is a brand logo. Zero detections are a failure/uncertain
   result, never a clean-media verdict. This code is not wired into publishing.
3. **Cross-platform compatibility** — test Android Chrome/PWA, iOS Safari/PWA and
   desktop browsers; verify OCR assets/network/CSP, bounded memory, duration,
   resolution, cancellation, output quality, and video/audio behavior.
4. **Safe fallback integration** — route supported and verified cases to client
   processing and use the current server path for unsupported or uncertain cases.
   Fail closed if neither path can produce a validated result.
5. **Acceptance and rollout** — compare a labelled sample set, verify playback/audio,
   output size/hash, upload and post creation; enable progressively and only then
   consider reducing Render usage.

## Phase 2 implementation details and known limits

- `src/lib/media-processing/logoCleanup.ts` is an opt-in image-only API. It accepts
  JPEG/PNG/WebP up to 8 MB, bounds decoded image pixels, limits candidate detection
  to corner zones, requires a minimum OCR confidence, blurs only the candidate boxes,
  and returns a SHA-256 hash and dimensions.
- Tesseract.js uses browser worker/WASM and language assets. Their availability,
  CSP compatibility, download size and performance must be verified on real devices.
  An OCR/network failure throws; it must not be converted to a successful result.
- Blurring text boxes is not semantic inpainting and may damage legitimate text or
  fail to hide a graphic mark. Do not market this as universal logo removal.
- Videos are not processed by this client API. Keep the server pipeline as fallback.
- This function is not yet connected to upload flows. The existing server path and
  publishing behavior remain unchanged while the client path is evaluated.

## Status

Phase 1 foundation is present. Phase 2 has an initial isolated OCR-based image
cleanup implementation, but full visual logo detection, video-frame processing,
upload integration, real-device acceptance and rollout are not complete.

# D-Social client-first media migration

## Scope and safety contract

This migration is isolated to media processing. Do not change feed, chat, discovery,
profiles, notifications, story expiration, database schema, or unrelated storage
policies as part of this work.

The existing Supabase Edge Function + Render processor remains the authoritative
fallback until the client processor has passed real-device acceptance tests.
A client-side preflight, successful worker exit, or hash calculation is NOT proof
that brand logos were detected or removed. Never publish the original as if it
were cleaned after a processing failure.

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

1. **Client foundation** — isolate worker protocol, validate supported input, report
   progress, allow cancellation, release worker resources, and fingerprint inputs.
2. **Client cleanup engine** — evaluate a browser-compatible visual logo detector
   (WebGPU where available, WASM fallback), combine with OCR, apply conservative
   masking/inpainting, and validate outputs. Keep this behind a feature flag.
3. **Cross-platform compatibility** — test Android Chrome/PWA, iOS Safari/PWA and
   desktop browsers; define bounded memory, duration, resolution and cancellation
   behavior.
4. **Safe fallback integration** — route supported/verified cases to client processing
   and use the current server path for unsupported or uncertain cases. Fail closed if
   neither path can produce a validated result.
5. **Acceptance and rollout** — compare a labelled sample set, verify playback/audio,
   output size/hash, upload and post creation; enable progressively and only then
   consider reducing Render usage.

## Current status

Phase 1 code adds an isolated worker preflight and typed client API. It only validates
MIME/size, computes SHA-256, and decodes image dimensions. It does not transform media,
inspect video frames, detect logos, or remove logos. It is not wired into publishing
and cannot mark media as clean. Build and real-device verification are still required.

# D-Social Media Processing — integration rollout

This integration is deliberately disabled by default. The current upload path remains authoritative unless the frontend build sets `VITE_MEDIA_PROCESSING_ENABLED=true`.

## Runtime behavior

- Uploads continue to the existing `social-media` bucket first.
- For **feed posts only**, when the feature flag is enabled, the app first runs `inspectMediaOnDevice()` to validate supported MIME type, file size, decoded image dimensions and calculate a SHA-256 fingerprint before upload. This preflight does not remove logos or prove the media is clean.
- After the uploader explicitly confirms rights to modify the selected media, the app calls the `process-media` Supabase Edge Function. The server processor remains mandatory and stories/other upload flows are intentionally out of scope.
- The Edge Function authenticates the Supabase user, restricts the source path to that user's storage folder, calls the private media service from server-side code, verifies output size and SHA-256, writes a content-addressed object, reads it back, and verifies it again.
- The app derives the public URL from the validated `processed_path`; it does not trust an arbitrary returned URL.
- When processing is enabled, any processing/configuration/storage/timeout error blocks publication; the original object is retained for retry but is never presented as a successfully cleaned result.
- If the feed post insert fails, the uploader removes only the newly uploaded original. Processed objects are content-addressed and may be reused by other submissions, so the client never deletes them; a future retention job must check references before cleanup.
- No database schema or non-media module is changed.

## Required Edge Function environment settings

Set these in the target Supabase project's Edge Function environment. Keep service credentials server-side; never place them in `VITE_*` variables or commit them:

- `MEDIA_ALLOWED_ORIGINS`: comma-separated exact browser origins allowed to call this function (for example, the production or staging app origin; no trailing slash). An empty list denies browser origins.
- `MEDIA_SERVICE_URL`: deployed HTTPS base URL of the dedicated media service.
- The media service validates the signed-in Supabase user session with the Supabase Auth endpoint; it does not require a shared service token.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only storage access key used by the Edge Function.

The Supabase runtime must provide `SUPABASE_URL` and either the legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` values or the current `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS` maps. The function resolves the default key from either format. Do not add a service-role/secret key to the browser bundle.

## Staging sequence

1. Deploy the dedicated media service to a staging environment and verify `/ready`.
2. Set the Edge Function secrets above in a dedicated Supabase staging project.
3. Deploy `supabase/functions/process-media` to staging and verify authenticated invocation, ownership rejection, hash/size checks, and fallback when the service is unavailable.
4. Build the app with `VITE_MEDIA_PROCESSING_ENABLED=true` in preview/staging only. The user must explicitly confirm media-processing rights; if processing fails or rights are not confirmed, publication is blocked.
5. Test image, video with audio, video without audio, oversized/invalid files, invalid sessions, timeout, service outage, storage outage, repeated requests, and failed feed-post inserts.
6. Keep the flag false in production until staging and rollback checks pass. Production rollout is a separate, explicit step.

## Important limits

- The dedicated media service now uses OCR to detect readable brand wordmarks in corner regions (including TikTok, Instagram, Facebook, YouTube, CapCut and other listed brands) and inpaints those detected regions before adding the visible D-Social mark. This is best-effort: icon-only, animated, stylized, central, or OCR-unreadable logos may remain, and inpainting may leave artifacts. It does not implement a hidden/forensic D-Social watermark. Do not claim universal cleanup without reviewing the output.
- The current media service does not include a durable Celery/Redis queue; do not treat this synchronous integration as validated for large-scale production traffic.
- No service URL or Edge Function deployment is assumed by this code.
- The app should not be considered production-integrated until the required staging checks pass.

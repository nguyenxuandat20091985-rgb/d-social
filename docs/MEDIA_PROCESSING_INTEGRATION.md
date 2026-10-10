# D-Social Media Processing — integration rollout

This integration is deliberately disabled by default. The current upload path remains authoritative unless the frontend build sets `VITE_MEDIA_PROCESSING_ENABLED=true`.

## Runtime behavior

- Uploads continue to the existing `social-media` bucket first.
- If the feature flag is enabled and the uploader explicitly confirms rights to modify the selected media, the app calls the `process-media` Supabase Edge Function.
- The Edge Function authenticates the Supabase user, restricts the source path to that user's storage folder, calls the private media service from server-side code, verifies output size and SHA-256, writes a content-addressed object, reads it back, and verifies it again.
- The app derives the public URL from the validated `processed_path`; it does not trust an arbitrary returned URL.
- Any processing/configuration/storage/timeout error returns to the original media URL (Fallback A). The original object is not deleted.
- If the post/story insert fails, the uploader attempts to remove both the newly uploaded original and any processed object created for that same submission.
- No database schema or non-media module is changed.

## Required Edge Function secrets

Set these in the target Supabase project's Edge Function secrets; never place them in `VITE_*` variables or commit them:

- `MEDIA_SERVICE_URL`: deployed HTTPS base URL of the dedicated media service.
- `MEDIA_SERVICE_API_TOKEN`: same server-to-server token configured on the media service.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only storage access key used by the Edge Function.

The Supabase runtime must provide `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or the project-compatible publishable/anon key expected by the deployed runtime). Do not add a service-role key to the browser bundle.

## Staging sequence

1. Deploy the dedicated media service to a staging environment and verify `/ready`.
2. Set the Edge Function secrets above in a dedicated Supabase staging project.
3. Deploy `supabase/functions/process-media` to staging and verify authenticated invocation, ownership rejection, hash/size checks, and fallback when the service is unavailable.
4. Build the app with `VITE_MEDIA_PROCESSING_ENABLED=true` in staging only. The user must explicitly confirm media-processing rights before processing is attempted.
5. Test image, video with audio, video without audio, oversized/invalid files, invalid sessions, timeout, service outage, storage outage, repeated requests, and failed post/story inserts.
6. Keep the flag false in production until staging and rollback checks pass. Production rollout is a separate, explicit step.

## Important limits

- The current media service does not include a durable Celery/Redis queue; do not treat this synchronous integration as validated for large-scale production traffic.
- No service URL or Edge Function deployment is assumed by this code.
- The app should not be considered production-integrated until the required staging checks pass.

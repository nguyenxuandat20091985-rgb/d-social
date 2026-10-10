# D-Social Media Processing Service

Private media-processing endpoint used by the authenticated Supabase Edge Function. The service scans corner regions for OCR-readable listed brand wordmarks, attempts inpainting, and adds the D-Social visible mark.

## Limits and verification
- Uploads default to 32 MiB maximum (`MAX_UPLOAD_BYTES`).
- Images and video frames default to 16 megapixels maximum (`MAX_IMAGE_PIXELS`).
- Videos default to 180 seconds maximum (`MAX_VIDEO_SECONDS`).
- The service reopens encoded image output and rescans it. It also rescans sampled video frames; output is rejected if a readable listed wordmark remains.
- This is best-effort OCR, not a universal logo detector. Icon-only, animated, stylized, central, or unreadable logos may remain, and inpainting may leave artifacts. A passed OCR scan does not prove that every logo is absent.
- Only process media the uploader owns or has permission to modify. Processing errors must block publishing; do not silently publish the original as cleaned media.

## Runtime
- `GET /ready` reports degraded status when FFmpeg, Tesseract, or required Supabase auth configuration is missing.
- `POST /api/v1/media/process-binary` multipart fields: `file`, `rights_confirmed=true`.
- Authentication: `Authorization: Bearer <Supabase user access token>`; the service validates the session against Supabase Auth.
- `X-Idempotency-Key` is accepted for correlation only; processing results are not currently deduplicated.
- Required environment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Optional environment: `MAX_UPLOAD_BYTES`, `MAX_IMAGE_PIXELS`, `MAX_VIDEO_SECONDS`, `DSOCIAL_WATERMARK_TEXT`. Never expose secrets in browser bundles.

## Tests
The media-processing unit tests are in `test_media_processing.py` and can be run with `python -m unittest discover -s services/media-processing-service -p 'test_*.py' -v` after installing `requirements.txt`.

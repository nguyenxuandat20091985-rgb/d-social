# D-Social Media Processing Service

Dedicated private-by-token processing endpoint for feed uploads. It inspects corner crops for OCR-readable brand wordmarks (TikTok, Instagram, Facebook, YouTube, CapCut, Kwai, Likee, Snapchat, Pinterest, Douyin, Weibo, Threads, LinkedIn, Vimeo, Triller, Twitch, Telegram, WhatsApp, Twitter/X and selected Chinese brand names), inpaints detected regions, then adds the D-Social visible mark.

## Limits
This is best-effort OCR detection, not a guarantee for icon-only, animated, stylized, central, or otherwise unreadable logos. The service re-opens encoded images and re-scans images and sampled video frames; if a readable listed brand mark remains, it rejects the output. This verification cannot prove the absence of every logo, and inpainting may leave artifacts. Do not represent an output as universally clean. Only process media the uploader owns or has permission to modify. Publishing must fail closed when processing fails; do not silently publish the original as cleaned.

## Resource limits
- `MAX_UPLOAD_BYTES` defaults to 32 MiB.
- `MAX_IMAGE_PIXELS` defaults to 16 megapixels and is enforced on the server for both images and video frames.
- `MAX_VIDEO_SECONDS` defaults to 180 seconds. Longer clips are rejected before frame processing.

## Runtime
- `GET /ready`
- `POST /api/v1/media/process-binary` multipart fields `file`, `rights_confirmed=true`; headers `X-Media-Service-Token`, `X-Idempotency-Key`
- Environment: `MEDIA_SERVICE_API_TOKEN` (secret), optional `MAX_UPLOAD_BYTES`, `DSOCIAL_WATERMARK_TEXT`

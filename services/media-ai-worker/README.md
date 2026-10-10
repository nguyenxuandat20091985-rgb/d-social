# D-Social Media AI Worker

Separate GPU-oriented worker for image watermark candidate detection and inpainting. It is intentionally isolated from the existing lightweight Render API service.

## Models

- Detector: `microsoft/Florence-2-base-ft` using open-vocabulary detection prompts for TikTok watermark/logo candidates.
- Restoration: LaMa via `simple-lama-inpainting`.

The detector is a candidate generator, not a guarantee. A mask is bounded to avoid restoring a large fraction of an image, and the detector runs again after restoration. If the post-check still finds a candidate, the worker returns an error and does not return a processed result.

## Configuration

- `AI_WORKER_TOKEN` — required bearer token for the internal endpoint.
- `FLORENCE_MODEL_ID` — defaults to `microsoft/Florence-2-base-ft`.
- `FLORENCE_MODEL_REVISION` — defaults to the verified commit `22b7c4db486ae0a2dde5c7dfb1f87ae116c28969`; change only after validating the replacement model revision.
- `MAX_UPLOAD_BYTES` — defaults to 16 MiB.
- `MAX_IMAGE_PIXELS` — defaults to 12 MP.
- `MAX_BOX_AREA_RATIO` — defaults to 0.15.

Deploy on a GPU-capable host with persistent model cache. The CUDA Docker image is not intended for the current free-tier CPU Render service. Do not enable this worker in production until a GPU deployment, model revision pin, authentication, memory/latency benchmark and representative image tests are complete.

## API

- `GET /ready` — reports whether all model components loaded.
- `POST /v1/process-image` — authenticated multipart image upload. On detected watermark candidates, returns a restored JPEG only after the detector re-check passes. When no candidate is found, returns the input with `X-AI-Worker-Status: no_candidate`; this is not proof that no watermark exists.

A production caller must check `X-AI-Worker-Status`, dimensions, size and SHA-256. Do not treat an arbitrary HTTP 200 as a cleaned result. Video processing is intentionally not exposed by this first worker version; video needs temporal mask tracking and audio-preserving muxing in a separate phase.

# Hardware-Adaptive Media Pipeline (V2)

## Device tiers
- **Strong**: browser reports at least 6 GB device memory, WebGPU adapter is available, and at least four logical CPU threads are reported. Only this tier is allowed to load the approximately 208 MB LaMa ONNX model.
- **Medium**: reported memory is 3–<6 GB, or memory is hidden but the browser has a reasonable CPU/WebGL profile. Skips LaMa and runs the cropped-mask interpolation worker.
- **Weak**: reported memory is below 3 GB, or capabilities are limited and memory is hidden. Skips LaMa and uses the bounded local interpolation fallback so it never waits for the large model.

## Safety and known limitation
Browsers often hide deviceMemory, particularly on iOS. Unknown RAM is treated conservatively as medium/weak, never as strong. WebGPU availability is probed via requestAdapter; WebGL is probed and its temporary context is released.

The existing authenticated server processing function accepts a storage path for media already stored in the user's account; it does not accept a small crop/mask payload. The Render media service requires a server-only token. Therefore this client branch does **not** upload media or expose a service secret for a pretend server fallback. Weak devices currently use local interpolation. A real crop-only server fallback requires a separately authenticated Edge Function/API contract that accepts a bounded crop + mask, verifies ownership/consent, and returns only the processed crop.

## Constraints
- Image input remains capped at 8 megapixels.
- Fast interpolation is limited to a crop of at most 2 megapixels per candidate.
- This is a performance fallback, not generative inpainting; busy textures can leave artifacts and require manual review.
- Real Android/iOS timing and memory measurements remain acceptance tests; navigator.deviceMemory is only an approximate bucket, not an exact RAM meter.

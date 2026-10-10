# Media Processing V2 — implementation status

## Implemented in the isolated test branch

- Browser PaddleOCR PP-OCRv5 worker is attempted first for readable brand wordmarks and handles in image corners. If the remote module or model initialization fails, the current Tesseract corner OCR remains as a fallback. This is OCR-based detection, not a universal logo detector.
- Detected candidate regions are converted into masks and passed through a LaMa ONNX inpainting worker. If LaMa fails, the automatic pipeline reports failure and leaves the manual-mask tool available; it does not claim the blurred or original image is clean.
- Manual masking maps finger/pointer coordinates to source-image pixels, crops the selected region plus surrounding context, and sends only that patch to the LaMa worker. A lightweight local interpolation action remains as an explicitly lower-quality alternative.
- The test page shows the processing stages and exposes the model progress. Video code and production posting flows are unchanged.
- LaMa inference is capped to 8 megapixels per patch and uses cropped regions to reduce memory pressure.

## External assets and zero-paid-service policy

- PaddleOCR JavaScript package is loaded from https://esm.sh/@paddleocr/paddleocr-js?bundle; its model assets and ONNX Runtime Web WASM assets are fetched from public endpoints when first needed.
- LaMa ONNX model: https://huggingface.co/sapienkit/LaMa-ONNX/resolve/main/lama_fp32.onnx (model card declares Apache-2.0).
- ONNX Runtime Web is loaded from jsDelivr. There is no paid inference endpoint and no source image is uploaded by this client pipeline; OCR and inpainting execute in browser workers.
- Public CDN/model availability, data transfer, CORS, cache behavior and model download size are operational dependencies. First-use performance is not guaranteed to be under 3–5 seconds; a cached warm run may be faster.

## Not yet acceptance-tested

- No benchmark has yet established detection precision/recall or a mobile runtime under 3–5 seconds.
- The default LaMa ONNX graph accepts fixed 512×512 input. The implementation resizes the selected patch to model dimensions and blends output within the mask, so fine details and large/complex marks may leave artifacts.
- PaddleOCR initialization from the ESM CDN must be validated in the deployed Vite/Render build and in Android Chrome/iOS Safari. If initialization fails, Tesseract fallback is used for detection.
- No universal detection guarantee: icon-only, transparent, animated, center-positioned or unfamiliar marks can be missed. User review is required before publishing.
- This branch is for isolated test use only. Do not merge into production until CI and real-device acceptance pass.

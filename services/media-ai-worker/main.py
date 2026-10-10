from __future__ import annotations

import hashlib
import hmac
import io
import logging
import os
from typing import Any

import numpy as np
import torch
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageDraw, UnidentifiedImageError
from simple_lama_inpainting import SimpleLama
from transformers import AutoModelForCausalLM, AutoProcessor

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("dsocial-media-ai-worker")

MODEL_ID = os.getenv("FLORENCE_MODEL_ID", "microsoft/Florence-2-base-ft")
MODEL_REVISION = os.getenv("FLORENCE_MODEL_REVISION", "22b7c4db486ae0a2dde5c7dfb1f87ae116c28969")
WORKER_TOKEN = os.getenv("AI_WORKER_TOKEN", "")
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(16 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", "12000000"))
MAX_BOX_AREA_RATIO = float(os.getenv("MAX_BOX_AREA_RATIO", "0.15"))
TASK = "<OPEN_VOCABULARY_DETECTION>"
QUERY = "TikTok watermark logo"

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
app = FastAPI(title="D-Social Media AI Worker", docs_url=None, redoc_url=None)
processor: Any = None
detector: Any = None
inpaint_model: Any = None
device = "cuda" if torch.cuda.is_available() else "cpu"
model_error: str | None = None


@app.on_event("startup")
def load_models() -> None:
    global processor, detector, inpaint_model, model_error, device
    try:
        dtype = torch.float16 if device == "cuda" else torch.float32
        processor = AutoProcessor.from_pretrained(
            MODEL_ID, revision=MODEL_REVISION, trust_remote_code=True
        )
        detector = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            revision=MODEL_REVISION,
            torch_dtype=dtype,
            trust_remote_code=True,
        ).to(device)
        detector.eval()
        inpaint_model = SimpleLama()
        model_error = None
        log.info(
            "AI models loaded detector=%s revision=%s device=%s",
            MODEL_ID, MODEL_REVISION, device
        )
    except Exception as exc:
        model_error = type(exc).__name__
        processor = detector = inpaint_model = None
        log.exception("AI model startup failed error=%s", model_error)


@app.get("/ready")
def ready():
    ready_state = processor is not None and detector is not None and inpaint_model is not None
    return {
        "status": "ready" if ready_state else "degraded",
        "service": "D-Social Media AI Worker",
        "model": MODEL_ID,
        "device": device,
        "models_loaded": ready_state,
        "model_error": model_error,
    }


def require_worker_auth(authorization: str | None) -> None:
    if not WORKER_TOKEN:
        raise HTTPException(503, "AI worker authentication is not configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Worker authentication required")
    supplied = authorization.split(" ", 1)[1].strip()
    if not hmac.compare_digest(supplied, WORKER_TOKEN):
        raise HTTPException(401, "Worker authentication failed")


def detect_watermark_boxes(image: Image.Image) -> list[tuple[int, int, int, int]]:
    if processor is None or detector is None:
        raise HTTPException(503, "AI detection model is not ready")
    prompt = TASK + QUERY
    inputs = processor(text=prompt, images=image, return_tensors="pt")
    inputs = {
        key: value.to(device=device, dtype=detector.dtype if key == "pixel_values" else value.dtype)
        for key, value in inputs.items()
    }
    with torch.inference_mode():
        generated = detector.generate(
            **inputs,
            max_new_tokens=256,
            num_beams=3,
            do_sample=False,
        )
    decoded = processor.batch_decode(generated, skip_special_tokens=False)[0]
    parsed = processor.post_process_generation(
        decoded, task=TASK, image_size=(image.width, image.height)
    )
    payload = parsed.get(TASK, {}) if isinstance(parsed, dict) else {}
    boxes = payload.get("bboxes", []) if isinstance(payload, dict) else []
    labels = payload.get("bboxes_labels", []) if isinstance(payload, dict) else []

    image_area = image.width * image.height
    candidates: list[tuple[int, int, int, int]] = []
    for index, raw_box in enumerate(boxes):
        label = str(labels[index] if index < len(labels) else QUERY).lower()
        if not any(word in label for word in ("tiktok", "watermark", "logo", "social media")):
            continue
        if not isinstance(raw_box, (list, tuple)) or len(raw_box) != 4:
            continue
        try:
            x1f, y1f, x2f, y2f = (float(value) for value in raw_box)
        except (TypeError, ValueError):
            continue
        if not np.isfinite([x1f, y1f, x2f, y2f]).all():
            continue
        x1 = max(0, min(image.width, int(min(x1f, x2f))))
        y1 = max(0, min(image.height, int(min(y1f, y2f))))
        x2 = max(0, min(image.width, int(max(x1f, x2f))))
        y2 = max(0, min(image.height, int(max(y1f, y2f))))
        area = max(0, x2 - x1) * max(0, y2 - y1)
        if area <= 0 or area / image_area > MAX_BOX_AREA_RATIO:
            continue
        pad_x = max(8, int((x2 - x1) * 0.18))
        pad_y = max(8, int((y2 - y1) * 0.18))
        box = (
            max(0, x1 - pad_x),
            max(0, y1 - pad_y),
            min(image.width, x2 + pad_x),
            min(image.height, y2 + pad_y),
        )
        if box not in candidates:
            candidates.append(box)
    return candidates


def build_mask(size: tuple[int, int], boxes: list[tuple[int, int, int, int]]) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    for box in boxes:
        draw.rectangle(box, fill=255)
    return mask


@app.post("/v1/process-image")
async def process_image(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    require_worker_auth(authorization)
    if processor is None or detector is None or inpaint_model is None:
        raise HTTPException(503, "AI models are not ready; no cleaned result is available")

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Image is empty or exceeds the worker upload limit")

    try:
        with Image.open(io.BytesIO(data)) as opened:
            opened.load()
            if opened.width <= 0 or opened.height <= 0 or opened.width * opened.height > MAX_IMAGE_PIXELS:
                raise HTTPException(413, "Image dimensions exceed the worker limit")
            original = opened.convert("RGB")
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(422, "Input is not a valid supported image") from exc

    try:
        boxes = detect_watermark_boxes(original)
        if not boxes:
            digest = hashlib.sha256(data).hexdigest()
            return Response(
                data,
                media_type="image/jpeg" if (file.content_type or "").lower() in ("image/jpeg", "image/jpg") else "image/png",
                headers={
                    "X-AI-Worker-Status": "no_candidate",
                    "X-AI-Worker-Model": MODEL_ID,
                    "X-AI-Worker-Boxes": "0",
                    "X-AI-Worker-SHA256": digest,
                    "Cache-Control": "no-store",
                    "X-Content-Type-Options": "nosniff",
                },
            )

        mask = build_mask(original.size, boxes)
        restored = inpaint_model(original, mask).convert("RGB")
        if restored.size != original.size:
            raise HTTPException(422, "AI restoration changed image dimensions")

        # Re-run the same detector. A remaining candidate means this output is not accepted.
        remaining = detect_watermark_boxes(restored)
        if remaining:
            raise HTTPException(422, "Watermark candidate remains after AI restoration")

        output = io.BytesIO()
        restored.save(output, format="JPEG", quality=95, optimize=True)
        output_bytes = output.getvalue()
        digest = hashlib.sha256(output_bytes).hexdigest()
        return Response(
            output_bytes,
            media_type="image/jpeg",
            headers={
                "X-AI-Worker-Status": "processed",
                "X-AI-Worker-Model": MODEL_ID,
                "X-AI-Worker-Boxes": str(len(boxes)),
                "X-AI-Worker-SHA256": digest,
                "X-AI-Worker-Validation": "detector-recheck-passed",
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("AI image processing failed error=%s", type(exc).__name__)
        raise HTTPException(503, "AI processing failed; do not publish the original as cleaned") from exc

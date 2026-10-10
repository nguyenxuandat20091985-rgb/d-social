from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from fastapi import HTTPException
from PIL import Image

SERVICE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVICE_DIR))
import main as media_service  # noqa: E402


class MediaProcessingSafetyTests(unittest.TestCase):
    def test_readiness_is_degraded_when_auth_config_is_missing(self):
        with (
            patch.object(media_service.shutil, "which", return_value="/usr/bin/tool"),
            patch.object(media_service, "SUPABASE_URL", ""),
            patch.object(media_service, "SUPABASE_ANON_KEY", ""),
        ):
            result = media_service.ready()

        self.assertEqual(result["status"], "degraded")
        self.assertFalse(result["configured"])

    def test_auth_fails_closed_when_session_or_configuration_is_missing(self):
        with patch.object(media_service, "SUPABASE_URL", ""):
            with self.assertRaises(HTTPException) as caught:
                media_service.auth("some-user-token")
        self.assertEqual(caught.exception.status_code, 401)

        with patch.object(media_service, "SUPABASE_URL", "https://example.supabase.co"), patch.object(
            media_service, "SUPABASE_ANON_KEY", "test-anon-key"
        ):
            with self.assertRaises(HTTPException) as caught:
                media_service.auth("")
        self.assertEqual(caught.exception.status_code, 401)

    def test_ocr_failure_blocks_brand_detection_instead_of_skipping_it(self):
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        with patch.object(media_service.pytesseract, "image_to_data", side_effect=RuntimeError("OCR unavailable")):
            with self.assertRaises(HTTPException) as caught:
                media_service.brand_boxes(frame)
        self.assertEqual(caught.exception.status_code, 503)

    def test_brand_detector_recognizes_a_listed_wordmark(self):
        frame = np.zeros((300, 400, 3), dtype=np.uint8)
        fake_ocr = {
            "text": ["TikTok"],
            "conf": ["95"],
            "left": [12],
            "top": [15],
            "width": [60],
            "height": [20],
        }
        empty_ocr = {"text": [], "conf": [], "left": [], "top": [], "width": [], "height": []}
        with patch.object(
            media_service.pytesseract,
            "image_to_data",
            side_effect=[fake_ocr, empty_ocr, empty_ocr, empty_ocr],
        ):
            boxes = media_service.brand_boxes(frame)
        self.assertEqual(len(boxes), 1)
        x1, y1, x2, y2 = boxes[0]
        self.assertGreaterEqual(x1, 0)
        self.assertGreaterEqual(y1, 0)
        self.assertLessEqual(x2, frame.shape[1])
        self.assertLessEqual(y2, frame.shape[0])

    def test_clean_frame_returns_count_of_regions_it_attempts_to_remove(self):
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        with patch.object(media_service, "brand_boxes", return_value=[(10, 10, 30, 30)]):
            cleaned, count = media_service.clean_frame(frame.copy())
        self.assertEqual(count, 1)
        self.assertEqual(cleaned.shape, frame.shape)

    def test_image_processing_reopens_and_verifies_encoded_output(self):
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "source.png"
            dst = Path(td) / "cleaned.jpg"
            Image.new("RGB", (80, 60), (120, 140, 160)).save(src)
            with patch.object(media_service, "brand_boxes", side_effect=[[], []]):
                media_service.process_image(src, dst)
            self.assertTrue(dst.exists())
            with Image.open(dst) as output:
                self.assertEqual(output.format, "JPEG")
                self.assertEqual(output.size, (80, 60))

    def test_image_processing_rejects_output_when_brand_remains_after_encoding(self):
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "source.png"
            dst = Path(td) / "cleaned.jpg"
            Image.new("RGB", (80, 60), (120, 140, 160)).save(src)
            with patch.object(media_service, "brand_boxes", side_effect=[[], [(2, 2, 20, 20)]]):
                with self.assertRaises(HTTPException) as caught:
                    media_service.process_image(src, dst)
        self.assertEqual(caught.exception.status_code, 422)
        self.assertIn("watermark remains", caught.exception.detail)

    def test_image_pixel_limit_is_checked_before_full_decode(self):
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "oversized.png"
            dst = Path(td) / "cleaned.jpg"
            Image.new("RGB", (20, 20), (0, 0, 0)).save(src)
            with patch.object(media_service, "MAX_IMAGE_PIXELS", 100):
                with self.assertRaises(HTTPException) as caught:
                    media_service.process_image(src, dst)
        self.assertEqual(caught.exception.status_code, 413)


if __name__ == "__main__":
    unittest.main()

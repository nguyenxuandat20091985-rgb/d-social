import unittest
from unittest.mock import patch

import numpy as np
from fastapi import HTTPException

import main


EMPTY_OCR = {
    "text": [],
    "conf": [],
    "left": [],
    "top": [],
    "width": [],
    "height": [],
}


class BrandBoxesOcrResilienceTests(unittest.TestCase):
    def setUp(self):
        self.frame = np.zeros((240, 320, 3), dtype=np.uint8)

    @patch("main.pytesseract.image_to_data")
    def test_single_variant_failure_does_not_abort_detection(self, image_to_data):
        image_to_data.side_effect = [
            RuntimeError("Tesseract timed out"),
            *([EMPTY_OCR] * 11),
        ]

        self.assertEqual(main.brand_boxes(self.frame), [])
        self.assertEqual(image_to_data.call_count, 12)

    @patch("main.pytesseract.image_to_data")
    def test_all_variants_failing_for_a_corner_fails_closed(self, image_to_data):
        image_to_data.side_effect = RuntimeError("Tesseract unavailable")

        with self.assertRaises(HTTPException) as raised:
            main.brand_boxes(self.frame)

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("top-left", raised.exception.detail)
        self.assertEqual(image_to_data.call_count, 3)


if __name__ == "__main__":
    unittest.main()

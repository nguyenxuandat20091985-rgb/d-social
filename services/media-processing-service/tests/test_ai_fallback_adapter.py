import unittest
from unittest.mock import patch

import cv2
import numpy as np
from fastapi import HTTPException

import main


class FakeResponse:
    def __init__(self, body, headers, status=200):
        self._body = body
        self.headers = headers
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, _limit=-1):
        return self._body


class AiFallbackAdapterTests(unittest.TestCase):
    def setUp(self):
        self.frame = np.zeros((64, 96, 3), dtype=np.uint8)

    def test_optional_unconfigured_worker_is_explicitly_disabled(self):
        with patch.multiple(
            main,
            AI_FALLBACK_URL="",
            AI_FALLBACK_TOKEN="",
            AI_FALLBACK_REQUIRED=False,
        ):
            result, status = main.run_ai_fallback(self.frame)
        self.assertEqual(status, "disabled")
        self.assertIs(result, self.frame)

    def test_required_but_unconfigured_worker_fails_closed(self):
        with patch.multiple(
            main,
            AI_FALLBACK_URL="",
            AI_FALLBACK_TOKEN="",
            AI_FALLBACK_REQUIRED=True,
        ):
            with self.assertRaises(HTTPException) as raised:
                main.run_ai_fallback(self.frame)
        self.assertEqual(raised.exception.status_code, 503)

    def test_processed_worker_output_must_have_validation_header(self):
        ok, encoded = cv2.imencode(".jpg", self.frame)
        self.assertTrue(ok)
        response = FakeResponse(
            encoded.tobytes(),
            {
                "X-AI-Worker-Status": "processed",
                "X-AI-Worker-Validation": "detector-recheck-passed",
                "Content-Type": "image/jpeg",
            },
        )
        with patch.multiple(
            main,
            AI_FALLBACK_URL="https://ai-worker.example",
            AI_FALLBACK_TOKEN="test-token",
            AI_FALLBACK_REQUIRED=True,
        ), patch("main.urllib.request.urlopen", return_value=response):
            result, status = main.run_ai_fallback(self.frame)
        self.assertEqual(status, "processed")
        self.assertEqual(result.shape, self.frame.shape)


if __name__ == "__main__":
    unittest.main()

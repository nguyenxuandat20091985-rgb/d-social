# D-Social Studio AI and Templates

- Browser Canvas/MediaRecorder Ken Burns motion clips (3–5 seconds).
- Slot-based TikTok Shop, Review and Travel templates with zoom/fade transitions.
- Generated clips are inserted into the existing timeline at the playhead.
- Optional API wrapper at /api/image-to-video.

Configure IMAGE_TO_VIDEO_ENDPOINT and IMAGE_TO_VIDEO_API_KEY as Vercel server-side environment variables. The provider must accept multipart fields image, prompt, preset, duration and return JSON { "url": "https://..." }. Fal.ai, Kling and Replicate have distinct asynchronous APIs; adapt polling and response parsing for the selected provider. Never expose API keys in browser code.

Limitations: MediaRecorder usually emits WebM on Chrome Android; no copyrighted template music is bundled. Add licensed audio in the editor.

UI refactor in progress.

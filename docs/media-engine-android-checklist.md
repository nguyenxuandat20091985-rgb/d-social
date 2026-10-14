# Fullscreen media engine: Android acceptance checklist

Use this checklist on the D-Social preview deployment for the exact commit under test. Do not test or merge on production.

## Photo flow
- [ ] Select a portrait photo and open the Fullscreen editor.
- [ ] Apply each filter and confirm preview changes.
- [ ] Add text, move it, add a sticker, move it independently.
- [ ] Tap **Tiếp**; wait for processing to finish before the caption step opens.
- [ ] Publish, then reopen/download the uploaded image and verify filter, text, sticker order and positions match preview.

## Video flow
- [ ] Select a 15–60 second video and verify the Play/Pause control.
- [ ] Start playback with original audio only; pause/resume.
- [ ] Select a Pixabay track, set both volume controls, then play/pause repeatedly.
- [ ] Choose a non-zero trim start and end; verify playback restarts at the trim start and stops at the trim end.
- [ ] Apply a filter, text and sticker; drag the sticker without moving the text.
- [ ] Tap **Tiếp** and wait for export; do not navigate away while the browser is recording.
- [ ] Publish the prepared output; verify the uploaded file plays with expected duration, image overlays and audio mix.
- [ ] Check actual MIME type/container on the downloaded file. Record whether this browser produces MP4 or WebM; never infer MP4 from the file name alone.

## Failure and recovery
- [ ] Test with a browser/device that does not support the selected MediaRecorder MIME type; the editor must show a useful error and still allow abandoning the draft.
- [ ] Test cancelling/closing after a failed export; the app remains responsive and a new post can be created.
- [ ] Verify ordinary Home feed uploads and 24-hour stories still work independently of the media renderer.

Record device model, Android version, browser version, input file type/duration/size, output type/size, and any visible error. A green CI build is not a substitute for this checklist.

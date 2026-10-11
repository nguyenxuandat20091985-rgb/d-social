# D-Social Media Processing Service — acceptance checklist

Preview only: https://d-social-media-quality-preview.onrender.com/media-test

This is an isolated test build. Do not upload sensitive/private media unless comfortable processing it in the browser. The browser does not intentionally upload selected media to a processing server. Keep your original files. Do not use unreviewed output for publishing.

## Before testing

- [ ] Open the preview URL on Android Chrome.
- [ ] Open it on a desktop browser.
- [ ] If available, open it on iPhone/iPad Safari.
- [ ] Use copies of media you own or are permitted to edit.
- [ ] Start with small files; the current video prototype accepts files up to 12 MB and frames up to 8 megapixels.
- [ ] Note device, browser, file type, file size, resolution, and duration for each case.

## Image test cases

| Case | Action | Expected safety behavior | Visual review |
|---|---|---|---|
| I-01 | Select a JPEG with a small text logo in a corner | Original remains visible; no automatic modification on upload | N/A |
| I-02 | Run “1. Phân tích logo” | Shows candidate text/region; does not change pixels yet | Is the candidate actually the logo? |
| I-03 | Confirm a valid candidate on a device that supports LaMa | Output appears only after explicit confirmation | Zoom to 100–200%; inspect edges and texture |
| I-04 | Candidate is ordinary text or background detail | Do not confirm; use manual selection instead | Verify no false removal |
| I-05 | Logo is pictorial, centered, translucent, or not OCR-readable | Automatic detection may fail and should offer manual selection | Mark as a known limitation, not “logo-free” |
| I-06 | Use “Tô vùng thủ công” | Red mask follows the selected area; original remains recoverable | Inspect mask alignment at image edges |
| I-07 | Use “So sánh tệp gốc” and download result | Both original and output are accessible | Compare dimensions, colors, halos and detail |
| I-08 | Cancel during analysis/restoration | No output is marked successful | Try again and ensure UI recovers |

## Video test cases

| Case | Action | Expected safety behavior | Visual/audio review |
|---|---|---|---|
| V-01 | Select an MP4 with a static corner logo | Upload does not process automatically | Original plays with sound |
| V-02 | Run “1. Phân tích nhiều khung hình” | Samples approximately 15%, 50%, 85% of duration | OCR candidates may be incomplete |
| V-03 | Drag a red region over the logo on the sample frame | Region is bounded to frame coordinates | Check selected box covers logo but minimizes background |
| V-04 | Run “2. Xóa vùng đỏ đã xác nhận” | Output only appears after encode and full decode validation | Check first, middle, and final sections |
| V-05 | Video with moving logo or camera motion | Current fixed-region filter may leave artifacts | Record as a known limitation; do not approve for production |
| V-06 | Video with audio | Optional audio stream is mapped to output | Check beginning, middle, and end for sound/sync |
| V-07 | No logo detected by OCR | Manual box selection remains possible | Do not treat “no candidate” as “clean” |
| V-08 | Unsupported, oversized, or corrupted input | Clear error; original remains unchanged | No blank or truncated output should be marked successful |
| V-09 | Cancel during analysis/encoding | UI reports cancellation and allows retry | Confirm the page becomes responsive |

## Quality score

Score each category 0–3 after visual review: 0 = unusable, 1 = obvious artifacts, 2 = acceptable with minor defects, 3 = clean enough for the intended use.

- Residual logo visibility: __ / 3
- Background reconstruction/distortion: __ / 3
- Edge halos or blur: __ / 3
- Video temporal flicker: __ / 3 / N/A for images
- Audio and synchronization: __ / 3 / N/A for images
- Output integrity and dimensions: __ / 3
- Mobile responsiveness and recovery: __ / 3

Record notes:
- Device/browser:
- Input media details:
- Steps taken:
- Result and download:
- Failure or visual artifacts:
- Console/error message if any:

## Release gate

- [ ] TypeScript/build passes on the latest preview commit.
- [ ] Automated safety tests pass.
- [ ] Android and desktop tests completed.
- [ ] iOS Safari tested if in scope.
- [ ] Representative image and video outputs visually reviewed.
- [ ] Video audio/duration/dimensions verified.
- [ ] No critical privacy, corruption, cancellation, or false-success issue.
- [ ] Owner explicitly approves a separate production release.

A live preview URL or successful build does not mean visual quality has passed. The current video engine uses a static FFmpeg delogo region and is still experimental; it is not a general high-quality video inpainting solution.

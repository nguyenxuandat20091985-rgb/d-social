import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [videoEditor, videoCleanup, mediaPage, imageCleanup] = await Promise.all([
  read('src/components/ClientVideoEditor.tsx'),
  read('src/lib/media-processing/videoCleanup.ts'),
  read('src/components/MediaProcessingTestPage.tsx'),
  read('src/lib/media-processing/logoCleanup.ts'),
])

test('video cleanup requires an explicit user action and region review', () => {
  assert.doesNotMatch(videoEditor, /autoStartedRef/)
  assert.match(videoEditor, /1\. Phân tích nhiều khung hình/)
  assert.match(videoEditor, /2\. Xóa vùng đỏ đã xác nhận/)
  assert.match(videoEditor, /onPointerDown=/)
})

test('video analysis samples multiple times and keeps OCR detection separate from restoration', () => {
  assert.match(videoEditor, /video\.duration \* 0\.15/)
  assert.match(videoEditor, /video\.duration \* 0\.5/)
  assert.match(videoEditor, /video\.duration \* 0\.85/)
  assert.match(videoEditor, /detectOnly: true/)
  assert.match(imageCleanup, /if \(options\.detectOnly\)/)
})

test('video output is bounded, preserves optional audio, and is fully decoded before success', () => {
  assert.match(videoCleanup, /if \(!region \|\| region\.width < 1 \|\| region\.height < 1\)/)
  assert.match(videoCleanup, /0:a\\?/)
  assert.match(videoCleanup, /options\.frameWidth - x/)
  assert.match(videoCleanup, /'-f', 'null', '-'/)
  assert.match(videoCleanup, /output\.byteLength < 100/)
  assert.match(videoCleanup, /type: 'video\/mp4'/)
  assert.match(videoCleanup, /abortFFmpeg/)
})

test('uploading an image does not automatically modify it and original/result comparison is available', () => {
  assert.doesNotMatch(mediaPage, /await runAutomatic\(file, true\)/)
  assert.match(mediaPage, /setOriginalUrl\(sourceUrl\)/)
  assert.match(mediaPage, /So sánh tệp gốc/)
  assert.match(mediaPage, /Tải kết quả/)
})

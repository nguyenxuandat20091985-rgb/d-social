import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const videoEditor = await readFile(new URL('../src/components/ClientVideoEditor.tsx', import.meta.url), 'utf8')
const videoCleanup = await readFile(new URL('../src/lib/media-processing/videoCleanup.ts', import.meta.url), 'utf8')

test('video processing requires an explicit user action', () => {
  assert.doesNotMatch(videoEditor, /autoStartedRef/)
  assert.doesNotMatch(videoEditor, /useEffect\s*\(/)
  assert.match(videoEditor, /onClick=\{\(\) => void process\(\)\}/)
})

test('video UI discloses the current single-frame/fixed-region limitation', () => {
  assert.match(videoEditor, /kiểm tra một khung hình/)
  assert.match(videoEditor, /chưa đạt chuẩn xóa logo chất lượng cao/)
  assert.match(videoEditor, /xem lại toàn bộ kết quả/)
})

test('video processing fails closed when no logo region is supplied', () => {
  assert.match(videoCleanup, /if \(!region \|\| region\.width < 1 \|\| region\.height < 1\)/)
  assert.match(videoCleanup, /Chưa có vùng logo được nhận diện/)
})

test('video output maps optional audio and validates a non-empty result', () => {
  assert.match(videoCleanup, /0:a\\?/)
  assert.match(videoCleanup, /output\.byteLength < 100/)
  assert.match(videoCleanup, /type: 'video\/mp4'/)
})

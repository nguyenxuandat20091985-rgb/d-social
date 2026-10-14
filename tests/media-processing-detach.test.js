import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('Home feed uploads media directly and does not depend on media-processing service', () => {
  assert.doesNotMatch(app, /MEDIA_PROCESSING_ENABLED|processUploadedMedia|functions\.invoke\(['"]process-media/)
  assert.match(app, /supabase\.storage\.from\(['"]social-media['"]\)\.upload\(path, file/)
  assert.match(app, /supabase\.from\(['"]posts['"]\)\.insert\(/)
})

test('24-hour News continues to upload and save stories independently', () => {
  const start = app.indexOf('function StoryComposer')
  const end = app.indexOf('function StoryViewer', start)
  assert.notEqual(start, -1, 'StoryComposer should exist')
  assert.notEqual(end, -1, 'StoryViewer should follow StoryComposer')
  const storyComposer = app.slice(start, end)

  assert.doesNotMatch(storyComposer, /MEDIA_PROCESSING_ENABLED|processUploadedMedia|functions\.invoke\(['"]process-media/)
  // StoryComposer uploads the processed export (uploadFile), not the original source file.
  assert.match(storyComposer, /supabase\.storage\.from\(['"]social-media['"]\)\.upload\(path, (?:file|uploadFile)/)
  assert.match(storyComposer, /supabase\.from\(['"]stories['"]\)\.insert\(/)
  assert.match(storyComposer, /Date\.now\(\) \+ 24 \* 60 \* 60 \* 1000/)
})

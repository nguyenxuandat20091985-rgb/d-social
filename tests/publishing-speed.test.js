import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const homeStart = app.indexOf('function Composer')
const storyStart = app.indexOf('function StoryComposer', homeStart)
const home = app.slice(homeStart, storyStart)

test('Home post uploads multiple attachments concurrently', () => {
  assert.notEqual(homeStart, -1)
  assert.notEqual(storyStart, -1)
  assert.match(home, /Promise\.allSettled\(files\.map\(async file/)
  assert.match(home, /const failedUpload = uploads\.find\(result => result\.status === 'rejected'\)/)
  assert.match(home, /remove\(uploadedPaths\)/)
})

test('Home post keeps attachment order and preserves the video/image post fields', () => {
  assert.match(home, /const media = uploads\.map\(result => result\.value\)/)
  assert.match(home, /const image_urls = media\.filter\(item => item\.file\.type\.startsWith\('image\/'\)\)\.map\(item => item\.url\)/)
  assert.match(home, /const video = media\.find\(item => item\.file\.type\.startsWith\('video\/'\)\)/)
  assert.match(home, /image_urls: image_urls\.length \? image_urls : null/)
  assert.match(home, /is_published: true/)
})

test('24-hour News upload remains separate and retains expiry behavior', () => {
  const storyStart = app.indexOf('function StoryComposer')
  const storyEnd = app.indexOf('function StoryViewer', storyStart)
  const story = app.slice(storyStart, storyEnd)
  assert.match(story, /storage\.from\('social-media'\)\.upload\(path, file/)
  assert.match(story, /Date\.now\(\) \+ 24 \* 60 \* 60 \* 1000/)
})

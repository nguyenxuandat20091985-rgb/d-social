import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const layers = await readFile(new URL('../src/lib/creatorLayers.ts', import.meta.url), 'utf8')
const exporter = await readFile(new URL('../src/features/media-editor/mediaExport.ts', import.meta.url), 'utf8')

test('creator layer contract supports stable IDs, visibility, normalized positions and z-order', () => {
  assert.match(layers, /export type CreatorLayer =/)
  assert.match(layers, /visible: boolean/)
  assert.match(layers, /zIndex: number/)
  assert.match(layers, /x: number/)
  assert.match(layers, /y: number/)
  assert.match(layers, /\.sort\(\(a, b\) => a\.zIndex - b\.zIndex/)
})

test('legacy text and sticker settings are adapted into the shared layer renderer', () => {
  assert.match(layers, /export function legacySettingsToLayers/)
  assert.match(exporter, /legacySettingsToLayers, normalizeCreatorLayers/)
  assert.match(exporter, /normalizeCreatorLayers\(settings\.layers \?\? legacySettingsToLayers\(settings\)\)/)
  assert.match(exporter, /layer\.kind === 'sticker'/)
  assert.match(exporter, /layer\.kind !== 'text'/)
})

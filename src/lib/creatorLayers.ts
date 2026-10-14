/**
 * D-Social-owned layer contract for the Fullscreen creator.
 *
 * Keep positions normalized (0..100) so the same layer can be drawn at preview
 * and export resolutions. This is intentionally independent of Remotion and
 * PhotoCraft; an engine can consume this contract without importing either UI.
 */
export type CreatorLayerKind = 'text' | 'sticker'

export type CreatorLayer = {
  id: string
  kind: CreatorLayerKind
  visible: boolean
  zIndex: number
  x: number
  y: number
  value: string
  color: string
  fontFamily: string
  fontSize: number
}

export type LegacyCreatorSettings = {
  overlayText?: string
  overlayFont?: string
  overlayColor?: string
  overlayX?: number
  overlayY?: number
  sticker?: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))

const asText = (value: unknown) => String(value ?? '').trim()

/** Convert the existing single-text/single-sticker state without changing UI behavior. */
export function legacySettingsToLayers(settings: LegacyCreatorSettings): CreatorLayer[] {
  const x = clamp(Number(settings.overlayX ?? 50), 8, 92)
  const y = clamp(Number(settings.overlayY ?? 50), 8, 92)
  const color = settings.overlayColor || '#ffffff'
  const fontFamily = settings.overlayFont || 'system-ui, sans-serif'
  const layers: CreatorLayer[] = []
  const sticker = asText(settings.sticker)
  const text = asText(settings.overlayText)

  if (sticker) {
    layers.push({
      id: 'legacy-sticker',
      kind: 'sticker',
      visible: true,
      zIndex: 10,
      x,
      y,
      value: sticker,
      color,
      fontFamily,
      fontSize: 54,
    })
  }

  if (text) {
    layers.push({
      id: 'legacy-text',
      kind: 'text',
      visible: true,
      zIndex: 20,
      x,
      y,
      value: text,
      color,
      fontFamily,
      fontSize: 38,
    })
  }

  return layers
}

/** Normalize untrusted/old layer data and keep ordering deterministic for export. */
export function normalizeCreatorLayers(layers: CreatorLayer[]): CreatorLayer[] {
  return layers
    .filter(layer => layer && (layer.kind === 'text' || layer.kind === 'sticker') && asText(layer.value))
    .map(layer => ({
      ...layer,
      id: asText(layer.id) || `${layer.kind}-layer`,
      visible: layer.visible !== false,
      zIndex: Number.isFinite(Number(layer.zIndex)) ? Number(layer.zIndex) : 0,
      x: clamp(Number(layer.x), 8, 92),
      y: clamp(Number(layer.y), 8, 92),
      value: asText(layer.value),
      color: asText(layer.color) || '#ffffff',
      fontFamily: asText(layer.fontFamily) || 'system-ui, sans-serif',
      fontSize: clamp(Number(layer.fontSize), 12, 160),
    }))
    .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))
}

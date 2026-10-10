/// <reference lib="webworker" />
type Request = { id: string; width: number; height: number; pixels: ArrayBuffer; mask: ArrayBuffer }
type Response = { id: string; pixels?: ArrayBuffer; error?: string }
const scope = self as DedicatedWorkerGlobalScope
scope.onmessage = (event: MessageEvent<Request>) => {
  const { id, width, height } = event.data
  try {
    const rgba = new Uint8ClampedArray(event.data.pixels)
    const mask = new Uint8Array(event.data.mask)
    if (width < 1 || height < 1 || width * height > 16_000_000 || rgba.length !== width * height * 4 || mask.length !== width * height) {
      throw new Error('Dữ liệu vùng xóa không hợp lệ.')
    }
    // Fast, bounded diffusion inpainting: expand known pixels inward from the user-painted mask.
    const known = new Uint8Array(mask.length)
    for (let i = 0; i < mask.length; i++) known[i] = mask[i] ? 0 : 1
    const maxPasses = Math.min(80, Math.max(12, Math.ceil(Math.max(width, height) * 0.025)))
    const offsets = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]
    for (let pass = 0; pass < maxPasses; pass++) {
      const updates: Array<[number, number, number, number, number]> = []
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = y * width + x
          if (!mask[i] || known[i]) continue
          let r = 0, g = 0, b = 0, weightSum = 0
          for (const [dx,dy] of offsets) {
            const ni = (y + dy) * width + x + dx
            if (!known[ni]) continue
            const weight = dx !== 0 && dy !== 0 ? 0.7071 : 1
            r += rgba[ni*4] * weight; g += rgba[ni*4+1] * weight; b += rgba[ni*4+2] * weight; weightSum += weight
          }
          if (weightSum) updates.push([i, Math.round(r/weightSum), Math.round(g/weightSum), Math.round(b/weightSum)])
        }
      }
      if (!updates.length) break
      for (const [i,r,g,b] of updates) {
        rgba[i*4] = r; rgba[i*4+1] = g; rgba[i*4+2] = b; known[i] = 1
      }
    }
    // Blend the inpainted pixels with a tiny neighborhood average to soften hard mask edges.
    const out = new Uint8ClampedArray(rgba)
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      if (!mask[i]) continue
      let r=0,g=0,b=0,n=0
      for (const [dx,dy] of offsets) {
        const ni=(y+dy)*width+x+dx
        r+=rgba[ni*4];g+=rgba[ni*4+1];b+=rgba[ni*4+2];n++
      }
      if (n) { out[i*4]=Math.round((rgba[i*4]+r/n)/2);out[i*4+1]=Math.round((rgba[i*4+1]+g/n)/2);out[i*4+2]=Math.round((rgba[i*4+2]+b/n)/2) }
    }
    scope.postMessage({ id, pixels: out.buffer } satisfies Response, [out.buffer])
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : 'Không thể nội suy vùng ảnh.' } satisfies Response)
  }
}
export {}

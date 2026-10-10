/// <reference lib="webworker" />
type Request = { id: string; width: number; height: number; pixels: ArrayBuffer; mask: ArrayBuffer }
type Response = { id: string; pixels?: ArrayBuffer; error?: string }
const scope = self as DedicatedWorkerGlobalScope
scope.onmessage = (event: MessageEvent<Request>) => {
  const { id, width, height } = event.data
  try {
    const rgba = new Uint8ClampedArray(event.data.pixels)
    const mask = new Uint8Array(event.data.mask)
    const total = width * height
    if (width < 1 || height < 1 || total > 2_000_000 || rgba.length !== total * 4 || mask.length !== total) {
      throw new Error('Dữ liệu vùng xóa không hợp lệ.')
    }
    const targets: number[] = []
    for (let i=0;i<mask.length;i++) if (mask[i]) targets.push(i)
    if (!targets.length || targets.length > Math.min(total * 0.15, 200_000)) throw new Error('Vùng tô quá lớn. Hãy chỉ tô quanh logo/chữ cần xóa.')
    const known = new Uint8Array(total)
    for (let i = 0; i < total; i++) known[i] = mask[i] ? 0 : 1
    const maxPasses = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(targets.length) * 0.04)))
    const offsets = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]
    for (let pass = 0; pass < maxPasses; pass++) {
      const updates: Array<[number, number, number, number]> = []
      for (const i of targets) {
        if (known[i]) continue
        const x = i % width, y = Math.floor(i / width)
        let r = 0, g = 0, b = 0, weightSum = 0
        for (const [dx,dy] of offsets) {
          const nx=x+dx, ny=y+dy
          if (nx<0 || ny<0 || nx>=width || ny>=height) continue
          const ni=ny*width+nx
          if (!known[ni]) continue
          const weight = dx !== 0 && dy !== 0 ? 0.7071 : 1
          r += rgba[ni*4] * weight; g += rgba[ni*4+1] * weight; b += rgba[ni*4+2] * weight; weightSum += weight
        }
        if (weightSum) updates.push([i, Math.round(r/weightSum), Math.round(g/weightSum), Math.round(b/weightSum)])
      }
      if (!updates.length) break
      for (const [i,r,g,b] of updates) {
        rgba[i*4] = r; rgba[i*4+1] = g; rgba[i*4+2] = b; known[i] = 1
      }
    }
    const out = new Uint8ClampedArray(rgba)
    for (const i of targets) {
      const x=i%width, y=Math.floor(i/width)
      let r=0,g=0,b=0,n=0
      for (const [dx,dy] of offsets) {
        const nx=x+dx,ny=y+dy
        if(nx<0||ny<0||nx>=width||ny>=height) continue
        const ni=ny*width+nx
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

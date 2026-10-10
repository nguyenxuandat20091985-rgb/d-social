/// <reference lib="webworker" />

type Request = { id: string; width: number; height: number; pixels: ArrayBuffer; mask: ArrayBuffer }
type Progress = { id: string; type: 'progress'; progress: number; stage: string }
type Complete = { id: string; type: 'complete'; pixels: ArrayBuffer }
type Failure = { id: string; type: 'error'; message: string }
type Reply = Progress | Complete | Failure
const scope = self as DedicatedWorkerGlobalScope

const MODEL_URL = 'https://huggingface.co/sapienkit/LaMa-ONNX/resolve/main/lama_fp32.onnx'
const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.webgpu.min.mjs'
const WASM_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/'

function send(message: Reply) { scope.postMessage(message) }
let runtimePromise: Promise<any> | undefined
let sessionPromise: Promise<any> | undefined
let modelBytesPromise: Promise<ArrayBuffer> | undefined
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }

async function readWithProgress(response: Response, id: string): Promise<ArrayBuffer> {
  if (!response.ok) throw new Error('Không tải được mô hình LaMa (' + response.status + ').')
  const length = Number(response.headers.get('content-length') || 0)
  if (!response.body) return response.arrayBuffer()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.byteLength
      send({ id, type: 'progress', progress: length ? Math.min(28, Math.round(loaded / length * 28)) : 8, stage: length ? 'Đang tải mô hình LaMa: ' + (loaded / 1048576).toFixed(1) + ' / ' + (length / 1048576).toFixed(1) + ' MB' : 'Đang tải mô hình LaMa…' })
    }
  }
  const merged = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
  return merged.buffer
}

async function run(request: Request) {
  const { id, width, height } = request
  const source = new Uint8ClampedArray(request.pixels)
  const mask = new Uint8Array(request.mask)
  const count = width * height
  if (width < 1 || height < 1 || count > 16_000_000 || source.length !== count * 4 || mask.length !== count) throw new Error('Kích thước ảnh hoặc mask không hợp lệ.')
  let minX = width, minY = height, maxX = -1, maxY = -1, painted = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue
    painted++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  if (!painted) throw new Error('Mask trống; hãy tô vùng logo trước.')
  if (painted > count * 0.15) throw new Error('Vùng tô vượt 15% ảnh. Hãy chỉ tô sát logo để tránh tốn RAM.')
  // Keep context around the mask, then run fixed-size 512x512 LaMa inference.
  const pad = Math.max(32, Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.45))
  const left = clamp(minX - pad, 0, width - 1), top = clamp(minY - pad, 0, height - 1)
  const right = clamp(maxX + pad + 1, left + 1, width), bottom = clamp(maxY + pad + 1, top + 1, height)
  const cropW = right - left, cropH = bottom - top
  if (cropW * cropH > count * 0.55) throw new Error('Vùng logo trải quá rộng. Hãy chia thành vùng nhỏ hơn.')
  const side = 512
  send({ id, type: 'progress', progress: 3, stage: 'Đang khởi tạo ONNX Runtime Web trong Web Worker…' })
  const moduleUrl: string = ORT_URL
  runtimePromise ??= import(/* @vite-ignore */ moduleUrl).then((loaded: any) => {
    loaded.env.wasm.wasmPaths = WASM_PATH
    loaded.env.wasm.numThreads = Math.min(2, typeof navigator === 'undefined' ? 1 : Math.max(1, navigator.hardwareConcurrency || 1))
    loaded.env.logLevel = 'error'
    return loaded
  })
  send({ id, type: 'progress', progress: 5, stage: 'Đang khởi tạo ONNX Runtime Web…' })
  const ortModule = await runtimePromise
  send({ id, type: 'progress', progress: 8, stage: 'Đang tải mô hình LaMa; lần đầu có thể mất nhiều thời gian và dữ liệu mạng…' })
  modelBytesPromise ??= fetch(MODEL_URL, { mode: 'cors', credentials: 'omit' }).then(response => readWithProgress(response, id)).catch(error => { modelBytesPromise = undefined; throw error })
  const modelBytes = await modelBytesPromise
  send({ id, type: 'progress', progress: 30, stage: 'Đã tải mô hình; đang khởi tạo phiên suy luận…' })
  sessionPromise ??= ortModule.InferenceSession.create(modelBytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    executionMode: 'sequential',
    intraOpNumThreads: 2,
  }).catch((error: unknown) => { sessionPromise = undefined; throw error })
  const session = await sessionPromise
  try {
    const imageTensor = new Float32Array(3 * side * side)
    const maskTensor = new Float32Array(side * side)
    // Bilinear sample from source into model space; mask uses nearest-neighbour.
    for (let y = 0; y < side; y++) {
      const sy = top + (y + 0.5) * cropH / side - 0.5
      const y0 = clamp(Math.floor(sy), top, bottom - 1), y1 = clamp(y0 + 1, top, bottom - 1), fy = clamp(sy - y0, 0, 1)
      for (let x = 0; x < side; x++) {
        const sx = left + (x + 0.5) * cropW / side - 0.5
        const x0 = clamp(Math.floor(sx), left, right - 1), x1 = clamp(x0 + 1, left, right - 1), fx = clamp(sx - x0, 0, 1)
        const target = y * side + x
        const mx = clamp(Math.round(left + (x + 0.5) * cropW / side), left, right - 1)
        const my = clamp(Math.round(top + (y + 0.5) * cropH / side), top, bottom - 1)
        maskTensor[target] = mask[my * width + mx] ? 1 : 0
        const p00 = (y0 * width + x0) * 4, p10 = (y0 * width + x1) * 4, p01 = (y1 * width + x0) * 4, p11 = (y1 * width + x1) * 4
        for (let c = 0; c < 3; c++) {
          const a = source[p00 + c] * (1 - fx) + source[p10 + c] * fx
          const b = source[p01 + c] * (1 - fx) + source[p11 + c] * fx
          imageTensor[c * side * side + target] = (a * (1 - fy) + b * fy) / 255
        }
      }
    }
    if (!maskTensor.some(value => value > 0)) throw new Error('Mask quá nhỏ sau khi đổi kích thước; hãy tô nét dày hơn.')
    send({ id, type: 'progress', progress: 42, stage: 'LaMa đang tái tạo nền vùng đã tô…' })
    const inputNames = session.inputNames
    const inputs: Record<string, unknown> = {}
    const imageName = inputNames.find(name => /image|img|input/i.test(name)) || inputNames[0]
    const maskName = inputNames.find(name => /mask/i.test(name)) || inputNames[1]
    inputs[imageName] = new ortModule.Tensor('float32', imageTensor, [1, 3, side, side])
    inputs[maskName] = new ortModule.Tensor('float32', maskTensor, [1, 1, side, side])
    const outputs = await session.run(inputs)
    const outputName = session.outputNames[0]
    const output = outputs[outputName]?.data
    if (!output || output.length < 3 * side * side) throw new Error('Mô hình LaMa trả về dữ liệu không đúng định dạng.')
    send({ id, type: 'progress', progress: 72, stage: 'Đang ghép kết quả LaMa vào ảnh gốc…' })
    const result = new Uint8ClampedArray(source)
    // Only blend inside the user-painted mask; the unmasked surrounding crop is context.
    for (let y = top; y < bottom; y++) {
      const my = clamp(Math.floor((y - top + 0.5) * side / cropH), 0, side - 1)
      for (let x = left; x < right; x++) {
        const index = y * width + x
        if (!mask[index]) continue
        const mx = clamp(Math.floor((x - left + 0.5) * side / cropW), 0, side - 1)
        const outIndex = my * side + mx
        const p = index * 4
        for (let c = 0; c < 3; c++) result[p + c] = clamp(Math.round(Number(output[c * side * side + outIndex])), 0, 255)
      }
    }
    send({ id, type: 'progress', progress: 95, stage: 'Đang kiểm tra dữ liệu ảnh đầu ra…' })
    send({ id, type: 'complete', pixels: result.buffer })
  } finally {
    // Keep the initialized session in this worker for subsequent manual-mask runs.
  }
}

scope.onmessage = event => {
  const request = event.data as Request
  void run(request).catch(error => send({ id: request?.id || '', type: 'error', message: error instanceof Error ? error.message : 'LaMa không thể xử lý vùng đã chọn.' }))
}
export {}

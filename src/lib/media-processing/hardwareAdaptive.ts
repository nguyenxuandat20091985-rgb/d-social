export type HardwareTier = 'strong' | 'medium' | 'weak'
export type HardwareProfile = {
  tier: HardwareTier
  deviceMemoryGB: number | null
  hardwareConcurrency: number
  webgpu: boolean
  webgl: boolean
  label: string
  reason: string
}

function hasWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    const supported = Boolean(gl)
    const lose = gl?.getExtension('WEBGL_lose_context')
    lose?.loseContext()
    return supported
  } catch {
    return false
  }
}

async function hasWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
    if (!gpu?.requestAdapter) return false
    return Boolean(await gpu.requestAdapter())
  } catch {
    return false
  }
}

/** Conservative client-side capability probe; never uploads user media. */
export async function detectHardwareProfile(): Promise<HardwareProfile> {
  if (typeof navigator === 'undefined') {
    return { tier: 'medium', deviceMemoryGB: null, hardwareConcurrency: 1, webgpu: false, webgl: false, label: 'Môi trường hạn chế · xử lý nhẹ', reason: 'Không có Navigator; không tải mô hình AI lớn.' }
  }
  const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown }
  const memory = typeof nav.deviceMemory === 'number' && Number.isFinite(nav.deviceMemory)
    ? nav.deviceMemory
    : null
  const cores = Math.max(1, Number(nav.hardwareConcurrency) || 1)
  const [webgpu, webgl] = await Promise.all([hasWebGPU(), Promise.resolve(hasWebGL())])

  if (memory !== null && memory >= 6 && webgpu && cores >= 4) {
    return { tier: 'strong', deviceMemoryGB: memory, hardwareConcurrency: cores, webgpu, webgl, label: 'Thiết bị mạnh · LaMa AI', reason: 'RAM ước tính ≥ 6 GB, có WebGPU và đủ luồng CPU.' }
  }
  if (memory !== null && memory < 3) {
    return { tier: 'weak', deviceMemoryGB: memory, hardwareConcurrency: cores, webgpu, webgl, label: 'Thiết bị cấu hình thấp · xử lý nhẹ', reason: 'RAM ước tính dưới 3 GB; tránh tải mô hình 208 MB.' }
  }
  if (memory !== null && memory >= 3 && memory < 6) {
    return { tier: 'medium', deviceMemoryGB: memory, hardwareConcurrency: cores, webgpu, webgl, label: 'Thiết bị trung bình · nội suy nhanh', reason: 'RAM ước tính 3–6 GB; bỏ qua mô hình LaMa nặng.' }
  }
  // deviceMemory is unavailable in many iOS browsers. Do not assume a powerful device.
  if (cores <= 2 || !webgl) {
    return { tier: 'weak', deviceMemoryGB: memory, hardwareConcurrency: cores, webgpu, webgl, label: 'Thiết bị hạn chế · xử lý nhẹ', reason: 'Không đọc được RAM và khả năng xử lý đồ họa/CPU hạn chế.' }
  }
  return { tier: 'medium', deviceMemoryGB: memory, hardwareConcurrency: cores, webgpu, webgl, label: 'Thiết bị chưa báo RAM · nội suy an toàn', reason: 'Trình duyệt không công bố RAM; dùng chế độ nhẹ để tránh tải mô hình lớn ngoài ý muốn.' }
}

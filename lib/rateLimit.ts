/**
 * API 限流中间件
 * 基于 IP + 路由的滑动窗口限流
 */

interface RateLimitEntry {
  timestamps: number[]
}

const store = new Map<string, RateLimitEntry>()

// 清理过期记录（每 10 分钟执行一次）
let lastCleanup = Date.now()
function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < 600000) return
  lastCleanup = now
  for (const [key, entry] of store.entries()) {
    entry.timestamps = entry.timestamps.filter(t => now - t < 60000)
    if (entry.timestamps.length === 0) store.delete(key)
  }
}

export interface RateLimitConfig {
  /** 时间窗口（毫秒），默认 60000（1分钟） */
  windowMs?: number
  /** 窗口内最大请求数，默认 20 */
  maxRequests?: number
}

/**
 * 检查是否被限流
 * @param key 限流键（通常是 IP + 路由）
 * @param config 限流配置
 * @returns { limited: boolean, retryAfterMs: number }
 */
export function rateLimit(
  key: string,
  config: RateLimitConfig = {}
): { limited: boolean; retryAfterMs: number } {
  const { windowMs = 60000, maxRequests = 20 } = config

  cleanup()

  const now = Date.now()
  let entry = store.get(key)

  if (!entry) {
    entry = { timestamps: [] }
    store.set(key, entry)
  }

  // 移除窗口外的旧记录
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs)

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0]
    const retryAfterMs = windowMs - (now - oldest)
    return { limited: true, retryAfterMs }
  }

  entry.timestamps.push(now)
  return { limited: false, retryAfterMs: 0 }
}

/**
 * 从请求中提取限流键（IP + 路由）
 */
export function getRateLimitKey(request: Request, route: string): string {
  // 优先使用 X-Forwarded-For（反向代理场景）
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
  return `${ip}:${route}`
}

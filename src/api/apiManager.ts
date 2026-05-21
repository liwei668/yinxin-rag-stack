import fs from 'fs'
import path from 'path'
import { searchCompany as mcpSearchCompany, getCompanyDetail as mcpGetCompanyDetail, searchCompaniesByIndustryRegion as mcpSearchByIndustryRegion, getStaffInfo as mcpGetStaffInfo, batchSearchAndArchive as mcpBatchSearchAndArchive } from '../lib/tianyanchaMCPClient'

// ========== 接口定义 ==========

interface ApiConfig {
  api_id: string
  name: string
  type: string
  baseUrl: string
  apiKey: string
  timeout: number
  proxyEnabled: boolean
  proxyUrl: string
  headers: Array<{ key: string; value: string }>
  requestPrefix: string
  retryCount: number
  retryOnTimeout: boolean
  maxQPS: number
  isActive: boolean
  remark: string
}

// ========== 自动迁移：api-config.json -> apis.json ==========

const OLD_CONFIG_PATH = path.join(process.cwd(), 'config', 'api-config.json')
const DATA_DIR = path.join(process.cwd(), 'data')
const APIS_FILE = path.join(DATA_DIR, 'apis.json')

/**
 * 检测 config/api-config.json 是否存在，如果存在则迁移到 data/apis.json
 */
function migrateOldConfig() {
  try {
    if (!fs.existsSync(OLD_CONFIG_PATH)) return
    if (fs.existsSync(APIS_FILE)) {
      // apis.json 已存在，只做备份
      fs.renameSync(OLD_CONFIG_PATH, OLD_CONFIG_PATH + '.bak')
      console.log('[apiManager] api-config.json 已存在 apis.json，旧文件已备份为 api-config.json.bak')
      return
    }

    // 读取旧配置
    const oldConfig = JSON.parse(fs.readFileSync(OLD_CONFIG_PATH, 'utf8'))
    const oldApis = oldConfig?.apis || {}

    // 转换为 apis.json 格式
    const newApis: ApiConfig[] = []
    for (const [name, config] of Object.entries(oldApis)) {
      const c = config as any
      let type = '其他'
      if (c.type === 'tavily') type = '搜索'
      else if (c.type === 'deepseek') type = 'LLM'

      newApis.push({
        api_id: `${name}-api`,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        type,
        baseUrl: c.type === 'tavily'
          ? 'https://api.tavily.com'
          : c.type === 'deepseek'
            ? 'https://api.deepseek.com'
            : '',
        apiKey: c.apiKey || '',
        timeout: c.type === 'tavily' ? 8000 : 30000,
        proxyEnabled: false,
        proxyUrl: '',
        headers: [],
        requestPrefix: '',
        retryCount: 2,
        retryOnTimeout: true,
        maxQPS: 10,
        isActive: true,
        remark: `从 api-config.json 迁移`,
      })
    }

    // 确保目录存在
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }

    // 写入 apis.json
    fs.writeFileSync(APIS_FILE, JSON.stringify(newApis, null, 2), 'utf8')

    // 备份旧文件
    fs.renameSync(OLD_CONFIG_PATH, OLD_CONFIG_PATH + '.bak')

    console.log(`[apiManager] 已迁移 ${newApis.length} 个 API 配置到 data/apis.json，旧文件已备份`)
  } catch (error) {
    console.error('[apiManager] 迁移 api-config.json 失败:', error)
  }
}

// ========== 配置读取 ==========

const readApisConfig = (): ApiConfig[] => {
  try {
    if (fs.existsSync(APIS_FILE)) {
      const raw = fs.readFileSync(APIS_FILE, 'utf8')
      return JSON.parse(raw)
    }
  } catch (error) {
    console.error('[apiManager] 读取 apis.json 失败:', error)
  }
  return []
}

// ========== 限流器 ==========

class RateLimiter {
  private timestamps: Map<string, number[]> = new Map()

  canProceed(apiId: string, maxQPS: number): boolean {
    const now = Date.now()
    const windowMs = 1000 // 1秒窗口
    const key = apiId

    let timestamps = this.timestamps.get(key) || []
    // 清理过期记录
    timestamps = timestamps.filter(t => now - t < windowMs)

    if (timestamps.length >= maxQPS) {
      return false
    }

    timestamps.push(now)
    this.timestamps.set(key, timestamps)
    return true
  }
}

// ========== 缓存管理器 ==========

class CacheManager {
  private cache: Map<string, { data: any; expiry: number }> = new Map()

  get(key: string) {
    const item = this.cache.get(key)
    if (!item) return null
    if (Date.now() > item.expiry) {
      this.cache.delete(key)
      return null
    }
    return item.data
  }

  set(key: string, data: any, ttl: number) {
    this.cache.set(key, { data, expiry: Date.now() + ttl * 1000 })
  }
}

// ========== Tavily 搜索 API 客户端 ==========

class TavilyAPIClient {
  constructor(private apiKey: string) {}

  async search(params: string | { query: string; max_results?: number; topic?: string; time_range?: string; search_depth?: string }) {
    try {
      const query = typeof params === 'string' ? params : params.query
      const maxResults = typeof params === 'string' ? 5 : (params.max_results || 5)
      const topic = typeof params === 'string' ? 'general' : (params.topic || 'general')
      const timeRange = typeof params === 'string' ? undefined : params.time_range
      const searchDepth = typeof params === 'string' ? 'basic' : (params.search_depth || 'basic')

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: query,
          search_depth: searchDepth,
          max_results: maxResults,
          include_answer: true,
          topic: topic,
          ...(timeRange ? { time_range: timeRange } : {}),
        }),
        signal: AbortSignal.timeout(8000)
      })

      if (!response.ok) {
        console.error('Tavily search request failed:', response.status)
        return { results: [] }
      }

      const data = await response.json()

      let answer = data.answer || ''

      const results = (data.results || [])
        .map((item: any) => ({
          title: item.title || '',
          url: item.url || '',
          summary: item.content || ''
        }))

      if (answer) {
        return { results, answer }
      }

      return { results }
    } catch (error) {
      console.error('Tavily search API error:', error)
      return { results: [] }
    }
  }
}

// ========== 天眼查 API 客户端（使用 MCP）==========

class TianyanchaAPIClient {
  constructor(private apiKey: string) {}

  async searchCompany(params: { name: string; keyword?: string; pageSize?: number; pageNum?: number }) {
    const { name, keyword, pageSize = 10, pageNum = 1 } = params

    try {
      const query = name || keyword
      if (!query) {
        throw new Error('请提供公司名称或关键词')
      }

      console.log('[TianyanchaAPI] 使用 MCP 搜索:', query)
      
      // 使用 MCP 客户端调用
      const result = await mcpSearchCompany({
        name: query,
        pageSize,
        pageNum,
      })

      return { data: result.data, total: result.total }
    } catch (error) {
      console.error('天眼查 MCP 搜索错误:', error)
      return { data: [], total: 0 }
    }
  }

  async getCompanyDetail(params: { companyId: string }) {
    const { companyId } = params

    try {
      if (!companyId) {
        throw new Error('请提供公司 ID')
      }

      console.log('[TianyanchaAPI] 使用 MCP 获取详情:', companyId)
      
      // 使用 MCP 客户端调用
      const result = await mcpGetCompanyDetail(companyId)

      return result
    } catch (error) {
      console.error('天眼查 MCP 详情错误:', error)
      return null
    }
  }
}

// ========== DeepSeek API 客户端 ==========

class DeepSeekAPIClient {
  constructor(private apiKey: string) {}

  async chat(params: { message: string; history?: any[]; systemPrompt?: string; model?: string; parameters?: any; customPrompt?: string }) {
    const { message, history = [], systemPrompt, model = 'deepseek-v4-flash', parameters = {}, customPrompt } = params

    const effectiveSystemPrompt = (customPrompt || systemPrompt || `你是「露丝」，引信（中国）技术有限公司的全能AI顾问。\n\n你具备多重专业能力，可以根据用户的具体需求灵活切换角色。\n\n当前日期：${new Date().getFullYear()}年${String(new Date().getMonth() + 1).padStart(2, '0')}月${String(new Date().getDate()).padStart(2, '0')}日\n\n重要指令：\n1. 直接回答用户问题，不要添加任何前缀或背景介绍\n2. 不要提及"基于您提供的时间戳"或类似的开场白\n3. 不要提及"根据我们全部对话历史"或类似的开场白\n4. 直接进入主题，提供具体、有价值的信息\n\n你可以自由回答用户的各种问题，包括投资分析、市场预测等。`) + '\n\n【数学公式格式要求】\n- 数学公式必须用 $...$ 包裹（行内）或 $$...$$ 包裹（块级）\n- 禁止使用 \\(...\\) 或 \\[...\\] 格式\n- 示例：$x^2 + y^2 = r^2$、$$\\int_0^1 x\\,dx = \\frac{1}{2}$$\n- 分数用 \\frac{a}{b}，根号用 \\sqrt{x}，上下标用 ^ 和 _\n- 禁止在公式中使用零宽空格等不可见字符'

    const messages: any[] = [
      { role: 'system', content: effectiveSystemPrompt }
    ]

    if (history && history.length > 0) {
      history.forEach((msg: any) => {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content
          })
        }
      })
    }

    messages.push({
      role: 'user',
      content: message
    })

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey || process.env.DEEPSEEK_API_KEY || ''}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: false,
        ...(parameters.temperature !== undefined ? { temperature: parameters.temperature } : {}),
        ...(parameters.topP !== undefined ? { top_p: parameters.topP } : {}),
        ...(parameters.maxTokens !== undefined ? { max_tokens: parameters.maxTokens } : {}),
        ...(parameters.frequencyPenalty !== undefined ? { frequency_penalty: parameters.frequencyPenalty } : {}),
        ...(parameters.presencePenalty !== undefined ? { presence_penalty: parameters.presencePenalty } : {}),
        ...(parameters.responseFormat && parameters.responseFormat !== 'text' ? { response_format: { type: parameters.responseFormat } } : {}),
      })
    })

    if (!response.ok) {
      const statusText = response.statusText
      let body = ''
      try { body = await response.text() } catch (_) {}
      console.error(`DeepSeek API error: ${response.status} ${statusText} - ${body.substring(0, 200)}`)
      throw new Error(`DeepSeek API 请求失败 (${response.status}): ${statusText}`)
    }

    return await response.json()
  }

  // Qwen-VL-Max 视觉模型 - 支持图片/文档识别（阿里云 DashScope）
  async vision(params: { imageUrl?: string; base64Image?: string; message?: string; mimeType?: string }) {
    const { imageUrl, base64Image, message = '请识别并描述这张图片的内容', mimeType = 'image/jpeg' } = params

    let imageContent: any
    if (base64Image) {
      imageContent = {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64Image}`
        }
      }
    } else if (imageUrl) {
      imageContent = {
        type: 'image_url',
        image_url: {
          url: imageUrl
        }
      }
    } else {
      throw new Error('请提供图片（imageUrl 或 base64Image）')
    }

    const messages = [
      {
        role: 'user',
        content: [
          imageContent,
          { type: 'text', text: message }
        ]
      }
    ]

    const apiKey = process.env.DASHSCOPE_API_KEY || ''
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'qwen-vl-max',
        messages: messages,
        stream: false
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Qwen-VL-Max] API 错误:', response.status, errorText)
      throw new Error(`Qwen-VL-Max API request failed: ${response.status}`)
    }

    const result = await response.json()
    return result
  }
}

// ========== API 管理器 ==========

class APIManager {
  private apis: ApiConfig[] = []
  private apiMap: Map<string, ApiConfig> = new Map()
  private cache = new CacheManager()
  private clients: Map<string, any> = new Map()
  private rateLimiter = new RateLimiter()

  constructor() {
    // 1. 先执行迁移
    migrateOldConfig()
    // 2. 加载 apis.json
    this.apis = readApisConfig()
    // 3. 构建索引
    this.rebuildIndex()
    // 4. 初始化客户端
    this.initClients()
    console.log(`[apiManager] 已加载 ${this.apis.length} 个 API 配置`)
  }

  private rebuildIndex() {
    this.apiMap.clear()
    for (const api of this.apis) {
      this.apiMap.set(api.api_id, api)
    }
  }

  private initClients() {
    for (const api of this.apis) {
      if (!api.isActive) continue
      try {
        let client: any = null
        const type = api.type?.toLowerCase() || ''
        const name = api.name?.toLowerCase() || ''

        if (type === '搜索' || name.includes('tavily')) {
          client = new TavilyAPIClient(api.apiKey || process.env.TAVILY_API_KEY || '')
        } else if (type === 'llm' || name.includes('deepseek')) {
          client = new DeepSeekAPIClient(api.apiKey || '')
        } else if (name.includes('天眼查') || api.api_id.includes('tianyancha')) {
          client = new TianyanchaAPIClient(api.apiKey || '')
        }

        if (client) {
          this.clients.set(api.api_id, client)
        }
      } catch (error) {
        console.error(`[apiManager] 创建客户端失败 ${api.api_id}:`, error)
      }
    }
  }

  /**
   * 通过 apiId 调用 API
   * @param apiId API 的 api_id（如 'deepseek-api', 'tavily-search'）
   * @param method 方法名（如 'chat', 'search', 'vision'）
   * @param params 参数
   */
  async call(apiId: string, method: string, params: any) {
    let config = this.apiMap.get(apiId)
    let client = this.clients.get(apiId)

    // 如果找不到，尝试重新加载 apis.json（应对热更新或文件变更）
    if (!config || !client) {
      console.log(`[apiManager] "${apiId}" 未找到，重新加载 apis.json`)
      this.apis = readApisConfig()
      this.rebuildIndex()
      this.initClients()
      config = this.apiMap.get(apiId)
      client = this.clients.get(apiId)
    }

    if (!config || !client) {
      throw new Error(`API "${apiId}" 未注册或未启用`)
    }

    // 限流检查
    const maxQPS = config.maxQPS || 10
    if (!this.rateLimiter.canProceed(apiId, maxQPS)) {
      throw new Error(`API "${apiId}" 请求过于频繁，已限流 (maxQPS: ${maxQPS})`)
    }

    // 检查缓存
    const cacheKey = `${apiId}:${method}:${JSON.stringify(params)}`
    const cachedResult = this.cache.get(cacheKey)
    if (cachedResult) {
      return cachedResult
    }

    // 自动重试
    const maxRetries = config.retryCount || 1
    const retryOnTimeout = config.retryOnTimeout !== false
    let lastError: any = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await client[method](params)

        // 缓存结果（chat 不缓存，搜索空结果不缓存）
        const type = config.type?.toLowerCase() || ''
        const isChat = method === 'chat'
        const isEmptySearch = type === '搜索' && method === 'search' &&
          (!result.results || result.results.length === 0) && !result.answer

        if (!isChat && !isEmptySearch) {
          this.cache.set(cacheKey, result, 300)
        }

        return result
      } catch (error: any) {
        lastError = error
        const isRetryable = retryOnTimeout && (
          error?.message?.includes('429') ||
          error?.message?.includes('500') ||
          error?.message?.includes('502') ||
          error?.message?.includes('503') ||
          error?.message?.includes('timeout') ||
          error?.message?.includes('Timeout') ||
          error?.message?.includes('ECONNRESET')
        )

        if (attempt < maxRetries && isRetryable) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
          console.warn(`[apiManager] ${apiId}.${method} 第${attempt}次失败，${delay}ms后重试: ${error?.message?.substring(0, 100)}`)
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          break
        }
      }
    }

    console.error(`[apiManager] ${apiId}.${method} 调用失败:`, lastError)
    throw lastError
  }

  /**
   * 兼容旧接口：通过名称调用 API
   * 名称映射：'deepseek' -> 'deepseek-api', 'tavily' -> 'tavily-search'
   */
  async callByName(name: string, method: string, params: any) {
    // 尝试直接匹配 api_id
    if (this.apiMap.has(name)) {
      return this.call(name, method, params)
    }

    // 尝试名称映射
    const nameMap: Record<string, string> = {
      'deepseek': 'deepseek-api',
      'tavily': 'tavily-search',
    }
    const mappedId = nameMap[name]
    if (mappedId && this.apiMap.has(mappedId)) {
      return this.call(mappedId, method, params)
    }

    throw new Error(`API "${name}" 未注册（尝试过映射: ${mappedId || '无'}）`)
  }

  /**
   * 获取 API 配置
   */
  getConfig(apiId: string): ApiConfig | undefined {
    return this.apiMap.get(apiId)
  }

  /**
   * 刷新配置（从文件重新加载）
   */
  reload() {
    this.apis = readApisConfig()
    this.rebuildIndex()
    this.clients.clear()
    this.initClients()
    console.log(`[apiManager] 已重新加载 ${this.apis.length} 个 API 配置`)
  }
}

export const apiManager = new APIManager()

/**
 * 通过 apiId 调用 API（新接口）
 */
export const callAPI = async (apiId: string, method: string, params: any) => {
  return apiManager.call(apiId, method, params)
}

/**
 * 兼容旧接口：通过名称调用 API
 * @deprecated 请使用 callAPI(apiId, method, params)
 */
export const callAPIByName = async (name: string, method: string, params: any) => {
  return apiManager.callByName(name, method, params)
}

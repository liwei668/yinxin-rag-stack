// API 存储（JSON 文件持久化）
import fs from 'fs'
import path from 'path'

// ========== 接口定义 ==========

export interface ApiItem {
  api_id: string;
  name: string;
  type: string; // 'LLM' | '搜索' | 'Embedding' | '语音' | '其他'
  baseUrl: string;
  apiKey: string;
  timeout: number;
  proxyEnabled: boolean;
  proxyUrl: string;
  headers: Array<{ key: string; value: string }>;
  requestPrefix: string;
  retryCount: number;
  retryOnTimeout: boolean;
  maxQPS: number;
  isActive: boolean;
  remark: string;
}

export interface ApiTestResult {
  success: boolean;
  responseTime: number;
  message: string;
  timestamp: Date;
}

// ========== 持久化工具 ==========

const DATA_DIR = path.join(process.cwd(), 'data')
const APIS_FILE = path.join(DATA_DIR, 'apis.json')

const loadApis = (): ApiItem[] => {
  try {
    if (fs.existsSync(APIS_FILE)) {
      const raw = fs.readFileSync(APIS_FILE, 'utf8')
      return JSON.parse(raw)
    }
  } catch (error) {
    console.error('[apiStore] 加载 APIs 文件失败:', error)
  }
  return null
}

const saveApis = (data: ApiItem[]) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(APIS_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (error) {
    console.error('[apiStore] 保存 APIs 文件失败:', error)
  }
}

// ========== 初始化 ==========

let apis: ApiItem[] = loadApis() || []
if (apis.length === 0) {
  // 如果文件不存在或为空，创建默认数据
  apis = [
    {
      api_id: 'deepseek-api',
      name: 'DeepSeek API',
      type: 'LLM',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      timeout: 30000,
      proxyEnabled: false,
      proxyUrl: '',
      headers: [],
      requestPrefix: '',
      retryCount: 2,
      retryOnTimeout: true,
      maxQPS: 10,
      isActive: true,
      remark: 'DeepSeek 官方 API',
    },
  ]
  saveApis(apis)
}
console.log(`[apiStore] 已加载 ${apis.length} 个 API 配置`)

// ========== 导出 Store ==========

export const apiStore = {
  // 获取所有 API
  getAll: (): ApiItem[] => {
    return apis
  },

  // 根据 api_id 获取
  getById: (apiId: string): ApiItem | null => {
    return apis.find(a => a.api_id === apiId) || null
  },

  // 根据类型获取
  getByType: (type: string): ApiItem[] => {
    return apis.filter(a => a.type === type)
  },

  // 创建 API
  create: (data: Omit<ApiItem, 'api_id'> & { api_id?: string }): ApiItem => {
    // 使用传入的 api_id 或自动生成
    const api_id = data.api_id || Date.now().toString(36) + Math.random().toString(36).substr(2, 6)

    // 全局唯一校验
    if (apis.find(a => a.api_id === api_id)) {
      throw new Error(`api_id "${api_id}" 已存在`)
    }

    const newApi: ApiItem = { ...data, api_id }
    apis.push(newApi)
    saveApis(apis)
    return newApi
  },

  // 更新 API
  update: (apiId: string, data: Partial<ApiItem>): ApiItem | null => {
    const index = apis.findIndex(a => a.api_id === apiId)
    if (index === -1) return null

    // 如果修改了 api_id，需要校验唯一性
    if (data.api_id && data.api_id !== apiId) {
      if (apis.find(a => a.api_id === data.api_id)) {
        throw new Error(`api_id "${data.api_id}" 已存在`)
      }
    }

    apis[index] = { ...apis[index], ...data }
    saveApis(apis)
    return apis[index]
  },

  // 删除 API
  delete: (apiId: string): boolean => {
    const initialLength = apis.length
    apis = apis.filter(a => a.api_id !== apiId)
    if (apis.length < initialLength) {
      saveApis(apis)
      return true
    }
    return false
  },

  // 检查是否有模型关联此 API
  checkDependency: (apiId: string): { hasDependency: boolean; modelNames: string[] } => {
    try {
      const modelsFile = path.join(DATA_DIR, 'models.json')
      if (fs.existsSync(modelsFile)) {
        const models = JSON.parse(fs.readFileSync(modelsFile, 'utf8'))
        const dependent = models.filter((m: any) => m.apiId === apiId)
        return {
          hasDependency: dependent.length > 0,
          modelNames: dependent.map((m: any) => m.name),
        }
      }
    } catch (error) {
      console.error('[apiStore] 检查依赖失败:', error)
    }
    return { hasDependency: false, modelNames: [] }
  },

  // 脱敏 API Key
  maskApiKey: (key: string): string => {
    if (!key) return ''
    if (key.length <= 8) return '****'
    return key.substring(0, 4) + '****' + key.substring(key.length - 4)
  },

  // 真实测试 API 连通性
  testConnection: async (apiId: string): Promise<ApiTestResult> => {
    const api = apis.find(a => a.api_id === apiId)
    if (!api) {
      return { success: false, responseTime: 0, message: 'API 不存在', timestamp: new Date() }
    }

    const startTime = Date.now()

    try {
      // 构建请求头
      const headers: Record<string, string> = {}
      if (api.apiKey) {
        headers['Authorization'] = `Bearer ${api.apiKey}`
      }
      // 添加自定义 headers
      for (const h of api.headers || []) {
        headers[h.key] = h.value
      }

      const timeout = api.timeout || 10000

      // 尝试测试连通性
      let success = false
      let message = ''

      // Embedding 类型 API 使用 POST 请求测试
      if (api.type === 'Embedding') {
        try {
          const response = await fetch(api.baseUrl, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: api.api_id,
              input: 'test'
            }),
            signal: AbortSignal.timeout(timeout),
          })
          // 400 可能是参数问题，但 API 连接是正常的
          success = response.ok || response.status === 400 || response.status === 401
          if (success) {
            message = `POST 请求成功 (HTTP ${response.status})`
          } else {
            message = `POST 请求失败 (HTTP ${response.status})`
          }
        } catch (fetchError: any) {
          success = false
          message = `连接失败: ${fetchError.message || fetchError}`
        }
      } else {
        // 其他类型使用 HEAD/GET
        try {
          const response = await fetch(api.baseUrl, {
            method: 'HEAD',
            headers,
            signal: AbortSignal.timeout(timeout),
          })
          success = response.ok || response.status === 405 || response.status === 404 || response.status === 401
          message = success
            ? `HEAD 请求成功 (HTTP ${response.status})`
            : `HEAD 请求失败 (HTTP ${response.status})`
        } catch {
          // HEAD 不支持时尝试 GET
          try {
            const response = await fetch(api.baseUrl, {
              method: 'GET',
              headers,
              signal: AbortSignal.timeout(timeout),
            })
            success = response.ok || response.status === 405 || response.status === 404 || response.status === 401
            message = success
              ? `GET 请求成功 (HTTP ${response.status})`
              : `GET 请求失败 (HTTP ${response.status})`
          } catch (fetchError: any) {
            // 连接失败
            success = false
            message = `连接失败: ${fetchError.message || fetchError}`
          }
        }
      }

      // 验证 Key 格式（如果有 Key）
      if (success && api.apiKey) {
        if (api.apiKey.startsWith('sk-') || api.apiKey.startsWith('tvly-')) {
          message += '，Key 格式有效'
        } else {
          message += '，Key 格式非标准，请确认'
        }
      }

      const responseTime = Date.now() - startTime
      return {
        success,
        responseTime,
        message: success
          ? `连接成功，响应时间: ${responseTime}ms，${message}`
          : `连接失败: ${message}`,
        timestamp: new Date(),
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime
      return {
        success: false,
        responseTime,
        message: `连接异常: ${error.message || error}`,
        timestamp: new Date(),
      }
    }
  },

  // 清空所有 API（仅用于测试）
  clear: (): void => {
    apis = []
    saveApis(apis)
  },
}

console.log('[apiStore] 初始化完成，支持 JSON 文件持久化')

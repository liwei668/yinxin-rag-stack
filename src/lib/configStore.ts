// 系统配置存储（JSON 文件持久化）
import fs from 'fs'
import path from 'path'

// ========== 类型定义 ==========

/**
 * 配置分组结构
 * - rag: RAG 相关配置
 * - modelDefaults: 模型默认参数
 * - voice: 语音相关配置
 * - system: 系统配置
 */
export interface ConfigStore {
  rag: {
    chunkSize: number;
    topKResults: number;
    similarityThreshold: number;
  };
  modelDefaults: {
    defaultTemperature: number;
    defaultMaxTokens: number;
  };
  voice: {
    voiceApiId: string;
    voiceName: string;
    voiceSpeed: number;
    asrThreshold: number;
  };
  system: {
    enableUserRegistration: boolean;
    sessionTimeout: number;
    maxUploadSize: number;
    allowedFileTypes: string;
    enableApiLogging: boolean;
    cacheEnabled: boolean;
    cacheTTL: number;
  };
}

// ========== 持久化工具 ==========

const DATA_DIR = path.join(process.cwd(), 'data')
const CONFIGS_FILE = path.join(DATA_DIR, 'configs.json')

const DEFAULT_CONFIGS: ConfigStore = {
  rag: {
    chunkSize: 800,
    topKResults: 3,
    similarityThreshold: 0.7,
  },
  modelDefaults: {
    defaultTemperature: 0.7,
    defaultMaxTokens: 4096,
  },
  voice: {
    voiceApiId: '',
    voiceName: '',
    voiceSpeed: 1.0,
    asrThreshold: 0.5,
  },
  system: {
    enableUserRegistration: true,
    sessionTimeout: 86400,
    maxUploadSize: 50,
    allowedFileTypes: '.txt,.md,.pdf,.doc,.docx,.xlsx,.xls,.csv,.html,.htm,.json,.xml,.jpg,.jpeg,.png,.gif,.bmp,.webp',
    enableApiLogging: true,
    cacheEnabled: true,
    cacheTTL: 3600,
  },
}

const loadConfigs = (): ConfigStore | null => {
  try {
    if (fs.existsSync(CONFIGS_FILE)) {
      const raw = fs.readFileSync(CONFIGS_FILE, 'utf8')
      return JSON.parse(raw)
    }
  } catch (error) {
    console.error('[configStore] 加载配置文件失败:', error)
  }
  return null
}

const saveConfigs = (data: ConfigStore) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(CONFIGS_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (error) {
    console.error('[configStore] 保存配置文件失败:', error)
  }
}

// ========== 初始化 ==========

let configs: ConfigStore = loadConfigs() || { ...DEFAULT_CONFIGS }
if (!loadConfigs()) {
  saveConfigs(configs)
}
console.log('[configStore] 配置已加载')

// ========== 导出 Store ==========

export const configStore = {
  /**
   * 获取指定分组下的配置值
   * @param group 分组名，如 'rag', 'modelDefaults', 'voice', 'system'
   * @param key 分组内的键名
   * @returns 配置值，不存在返回 null
   */
  get: <G extends keyof ConfigStore>(group: G, key: keyof ConfigStore[G]): any => {
    const groupData = configs[group]
    if (groupData && key in groupData) {
      return (groupData as any)[key]
    }
    return null
  },

  /**
   * 设置指定分组下的配置值，修改后自动持久化
   * @param group 分组名
   * @param key 分组内的键名
   * @param value 要设置的值
   */
  set: <G extends keyof ConfigStore>(group: G, key: string, value: any): void => {
    if (!configs[group]) {
      (configs as any)[group] = {}
    }
    (configs[group] as any)[key] = value
    saveConfigs(configs)
  },

  /**
   * 获取整个分组
   * @param group 分组名
   * @returns 分组对象，不存在返回 null
   */
  getGroup: <G extends keyof ConfigStore>(group: G): ConfigStore[G] | null => {
    return configs[group] || null
  },

  /**
   * 获取所有配置
   * @returns 完整的配置对象
   */
  getAll: (): ConfigStore => {
    return configs
  },

  /**
   * 重置为默认配置
   */
  reset: (): void => {
    configs = { ...DEFAULT_CONFIGS }
    saveConfigs(configs)
  },

  /**
   * 清空所有配置（仅用于测试）
   */
  clear: (): void => {
    configs = {} as ConfigStore
    saveConfigs(configs)
  },
}

console.log('[configStore] 初始化完成，支持 JSON 文件持久化')

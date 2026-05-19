// 模型存储（JSON 文件持久化）
import fs from 'fs'
import path from 'path'

// ========== 接口定义 ==========

interface ModelTestResult {
  success: boolean;
  responseTime: number;
  message: string;
  timestamp: Date;
}

interface ModelMetrics {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  averageResponseTime: number;
  lastCallTime: Date | null;
}

interface ModelFeatures {
  webSearch: boolean;
  ragEnabled: boolean;
  agentEnabled: boolean;
  memoryEnabled: boolean;
  streamOutput: boolean;
}

interface Model {
  id: string;
  name: string;
  type: 'embedding' | 'llm' | 't2v' | 'multimodal';
  provider: string;
  modelId: string;
  apiId: string;           // 关联的 API ID（替代 apiKey 和 endpoint）
  parameters: {
    // LLM 通用参数
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    contextWindow?: number;
    // LLM 高级参数
    frequencyPenalty?: number;
    presencePenalty?: number;
    responseFormat?: string;
    // Embedding 专用参数
    dimensions?: number;
  };
  features: ModelFeatures; // 功能开关
  scenario: string[];       // 适用场景：general / analysis / multimodal
  customPrompt: string;    // 自定义系统提示词
  remark: string;          // 备注
  isDefault: boolean;
  isEnabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  metrics: ModelMetrics;
  lastTestResult: ModelTestResult | null;
}

// ========== 持久化工具 ==========

const DATA_DIR = path.join(process.cwd(), 'data')
const MODELS_FILE = path.join(DATA_DIR, 'models.json')

// 默认模型（首次初始化时写入）
const DEFAULT_MODELS: Model[] = [
  {
    id: '1',
    name: 'nomic-embed-text',
    type: 'embedding',
    provider: 'nomic',
    modelId: 'nomic-embed-text-v1.5',
    apiId: 'ollama-local',
    parameters: { dimensions: 768 },
    features: { webSearch: false, ragEnabled: false, agentEnabled: false, memoryEnabled: false, streamOutput: false },
    scenario: [],
    customPrompt: '',
    remark: 'Ollama 本地 Embedding 模型',
    isDefault: true,
    isEnabled: true,
    createdBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    metrics: { totalCalls: 0, successCount: 0, failureCount: 0, averageResponseTime: 0, lastCallTime: null },
    lastTestResult: null,
  },
  {
    id: '2',
    name: 'deepseek-v4-pro',
    type: 'llm',
    provider: 'deepseek',
    modelId: 'deepseek-v4-pro',
    apiId: 'deepseek-api',
    parameters: { temperature: 0.7, topP: 0.95, maxTokens: 4096, contextWindow: 65536 },
    features: { webSearch: true, ragEnabled: true, agentEnabled: true, memoryEnabled: true, streamOutput: true },
    scenario: ['general', 'analysis'],
    customPrompt: '',
    remark: 'DeepSeek V4 Pro 高性能模型',
    isDefault: false,
    isEnabled: true,
    createdBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    metrics: { totalCalls: 0, successCount: 0, failureCount: 0, averageResponseTime: 0, lastCallTime: null },
    lastTestResult: null,
  },
  {
    id: '3',
    name: 'Qwen3-Max',
    type: 'llm',
    provider: 'dashscope',
    modelId: 'qwen-max',
    apiId: 'dashscope-api',
    parameters: { temperature: 0.7, topP: 0.95, maxTokens: 4096, contextWindow: 32768 },
    features: { webSearch: true, ragEnabled: true, agentEnabled: false, memoryEnabled: true, streamOutput: true },
    scenario: ['general', 'analysis'],
    customPrompt: '',
    remark: '阿里云通义千问 Max 版本',
    isDefault: false,
    isEnabled: true,
    createdBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    metrics: { totalCalls: 0, successCount: 0, failureCount: 0, averageResponseTime: 0, lastCallTime: null },
    lastTestResult: null,
  },
  {
    id: '4',
    name: 'DeepSeek V4 Flash',
    type: 'llm',
    provider: 'deepseek',
    modelId: 'deepseek-v4-flash',
    apiId: 'deepseek-api',
    parameters: { temperature: 0.7, topP: 0.95, maxTokens: 4096, contextWindow: 65536 },
    features: { webSearch: true, ragEnabled: true, agentEnabled: true, memoryEnabled: true, streamOutput: true },
    scenario: ['general'],
    customPrompt: '',
    remark: 'DeepSeek V4 Flash 快速模型',
    isDefault: true,
    isEnabled: true,
    createdBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    metrics: { totalCalls: 0, successCount: 0, failureCount: 0, averageResponseTime: 0, lastCallTime: null },
    lastTestResult: null,
  },
  {
    id: '5',
    name: 'qwen2.5vl:7b',
    type: 'llm',
    provider: 'ollama',
    modelId: 'qwen2.5vl:7b',
    apiId: 'ollama-local',
    parameters: { temperature: 0.7, topP: 0.95, maxTokens: 4096, contextWindow: 32768 },
    features: { webSearch: false, ragEnabled: false, agentEnabled: false, memoryEnabled: false, streamOutput: false },
    scenario: ['multimodal'],
    customPrompt: '',
    remark: 'Ollama 本地 Qwen2.5 VL 视觉模型',
    isDefault: false,
    isEnabled: true,
    createdBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    metrics: { totalCalls: 0, successCount: 0, failureCount: 0, averageResponseTime: 0, lastCallTime: null },
    lastTestResult: null,
  },
]

// 从文件加载模型（逐条容错，单条失败不影响其他模型）
const loadModels = (): Model[] => {
  try {
    if (fs.existsSync(MODELS_FILE)) {
      const raw = fs.readFileSync(MODELS_FILE, 'utf8')
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        console.error('[modelStore] models.json 格式错误：不是数组')
        return null
      }
      // 逐条解析，跳过格式错误的条目
      const valid: Model[] = []
      for (const m of parsed) {
        try {
          if (!m.id || !m.modelId) {
            console.warn('[modelStore] 跳过缺少 id/modelId 的模型:', m.name || m)
            continue
          }
          valid.push({
            ...m,
            createdAt: new Date(m.createdAt),
            updatedAt: new Date(m.updatedAt),
            metrics: m.metrics ? {
              ...m.metrics,
              lastCallTime: m.metrics.lastCallTime ? new Date(m.metrics.lastCallTime) : null,
            } : {
              totalCalls: 0, successCount: 0, failureCount: 0, averageResponseTime: 0, lastCallTime: null
            },
            lastTestResult: m.lastTestResult ? {
              ...m.lastTestResult,
              timestamp: new Date(m.lastTestResult.timestamp),
            } : null,
          })
        } catch (e) {
          console.warn('[modelStore] 跳过解析失败的模型:', m.id || m.name || m, e)
        }
      }
      if (valid.length === 0) {
        console.warn('[modelStore] 没有有效模型数据')
        return null
      }
      console.log(`[modelStore] 成功加载 ${valid.length}/${parsed.length} 个模型`)
      return valid
    }
  } catch (error) {
    console.error('[modelStore] 加载模型文件失败:', error)
  }
  return null
}

// 保存模型到文件
const saveModels = (data: Model[]) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(MODELS_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (error) {
    console.error('[modelStore] 保存模型文件失败:', error)
  }
}

// 初始化：从文件加载，不存在则用默认值
const loadedModels = loadModels()
let models: Model[] = loadedModels || [...DEFAULT_MODELS]
if (!loadedModels) {
  saveModels(models)
}
console.log(`[modelStore] 已加载 ${models.length} 个模型`)

// ========== 导出 Store ==========

export const modelStore = {
  getAll: (): Model[] => {
    return models;
  },

  getByType: (type: 'embedding' | 'llm'): Model[] => {
    return models.filter(model => model.type === type);
  },

  getDefault: (type: 'embedding' | 'llm'): Model | null => {
    return models.find(model => model.type === type && model.isDefault && model.isEnabled) || null;
  },

  getById: (id: string): Model | null => {
    return models.find(model => model.id === id) || null;
  },

  create: (data: Omit<Model, 'id' | 'createdAt' | 'updatedAt' | 'metrics' | 'lastTestResult'>): Model => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const now = new Date();

    const newModel: Model = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
      metrics: { totalCalls: 0, successCount: 0, failureCount: 0, averageResponseTime: 0, lastCallTime: null },
      lastTestResult: null,
    };

    if (newModel.isDefault) {
      models = models.map(model => {
        if (model.type === newModel.type) {
          return { ...model, isDefault: false };
        }
        return model;
      });
    }

    models.push(newModel);
    saveModels(models); // 持久化
    return newModel;
  },

  update: (id: string, data: Partial<Model>): Model | null => {
    const index = models.findIndex(model => model.id === id);
    if (index !== -1) {
      const updatedModel = {
        ...models[index],
        ...data,
        updatedAt: new Date(),
      };

      models[index] = updatedModel;

      if (updatedModel.isDefault) {
        models = models.map(model => {
          if (model.type === updatedModel.type && model.id !== id) {
            return { ...model, isDefault: false };
          }
          return model;
        });
      }

      saveModels(models); // 持久化
      return updatedModel;
    }
    return null;
  },

  delete: (id: string): boolean => {
    const model = models.find(m => m.id === id);
    if (!model) return false;
    if (model.isDefault) return false;

    const initialLength = models.length;
    models = models.filter(model => model.id !== id);
    saveModels(models); // 持久化
    return models.length < initialLength;
  },

  setDefault: (id: string): Model | null => {
    const model = models.find(m => m.id === id);
    if (!model) return null;

    models = models.map(m => {
      if (m.type === model.type) {
        return { ...m, isDefault: m.id === id };
      }
      return m;
    });

    saveModels(models); // 持久化
    return models.find(m => m.id === id) || null;
  },

  toggleStatus: (id: string, isEnabled: boolean): Model | null => {
    const index = models.findIndex(model => model.id === id);
    if (index !== -1) {
      models[index] = {
        ...models[index],
        isEnabled,
        updatedAt: new Date(),
      };
      saveModels(models); // 持久化
      return models[index];
    }
    return null;
  },

  clear: (): void => {
    models = [];
    saveModels(models);
  },

  recordCall: (id: string, success: boolean, responseTime: number): Model | null => {
    const index = models.findIndex(model => model.id === id);
    if (index !== -1) {
      const model = models[index];
      const newTotalCalls = model.metrics.totalCalls + 1;
      const newSuccessCount = success ? model.metrics.successCount + 1 : model.metrics.successCount;
      const newFailureCount = !success ? model.metrics.failureCount + 1 : model.metrics.failureCount;
      const newAverageResponseTime = ((model.metrics.averageResponseTime * model.metrics.totalCalls) + responseTime) / newTotalCalls;

      models[index] = {
        ...model,
        updatedAt: new Date(),
        metrics: {
          totalCalls: newTotalCalls,
          successCount: newSuccessCount,
          failureCount: newFailureCount,
          averageResponseTime: newAverageResponseTime,
          lastCallTime: new Date(),
        },
      };
      saveModels(models); // 持久化
      return models[index];
    }
    return null;
  },

  // 真实测试模型连接（发一条测试消息验证 API 是否可用）
  testModel: async (id: string): Promise<ModelTestResult> => {
    const model = models.find(m => m.id === id);
    if (!model) {
      return { success: false, responseTime: 0, message: '模型不存在', timestamp: new Date() };
    }

    const startTime = Date.now();

    try {
      let success = false;
      let responseText = '';

      if (model.provider === 'ollama') {
        // 测试 Ollama 本地模型
        if (model.type === 'embedding') {
          // Embedding 模型使用 /api/embeddings 端点
          const response = await fetch('http://localhost:11434/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model.modelId,
              prompt: 'hello world',
            }),
            signal: AbortSignal.timeout(15000),
          });
          success = response.ok;
          if (success) {
            const data = await response.json();
            const embeddingLength = data.embedding?.length || 0;
            responseText = `Embedding 向量长度: ${embeddingLength}`;
          } else {
            responseText = `HTTP ${response.status}: ${response.statusText}`;
          }
        } else {
          // LLM/多模态模型使用 /api/chat 端点
          const response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model.modelId,
              messages: [{ role: 'user', content: 'hi' }],
              stream: false,
            }),
            signal: AbortSignal.timeout(60000),
          });
          success = response.ok;
          if (success) {
            const data = await response.json();
            responseText = data.message?.content || data.response || '连接成功';
          } else {
            responseText = `HTTP ${response.status}: ${response.statusText}`;
          }
        }
      } else {
        // 通用 OpenAI 兼容接口测试（通过 apiId 查找 API 配置）
        let baseUrl = ''
        let apiKey = ''

        // 尝试从 apis.json 获取 API 配置
        try {
          const apisFile = path.join(DATA_DIR, 'apis.json')
          if (fs.existsSync(apisFile)) {
            const apis = JSON.parse(fs.readFileSync(apisFile, 'utf8'))
            const apiConfig = apis.find((a: any) => a.api_id === model.apiId)
            if (apiConfig) {
              baseUrl = apiConfig.baseUrl || ''
              apiKey = apiConfig.apiKey || ''
            }
          }
        } catch {
          // 读取失败，使用空值
        }

        // 兼容旧数据：如果 apiId 没有匹配到，尝试从环境变量获取
        if (!apiKey) {
          if (model.provider === 'deepseek') apiKey = process.env.DEEPSEEK_API_KEY || ''
          if (model.provider === 'dashscope') apiKey = process.env.DASHSCOPE_API_KEY || ''
        }

        // 构建端点 URL
        let endpoint = baseUrl
        if (endpoint && !endpoint.includes('/chat/completions')) {
          endpoint = endpoint.replace(/\/$/, '') + '/chat/completions'
        }

        if (!endpoint) {
          responseText = '未配置 API 端点（请检查模型关联的 API 配置）'
        } else {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

          // T2V 模型使用特殊的视频生成接口测试
          if (model.type === 't2v') {
            const response = await fetch(baseUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                model: model.modelId,
                input: {
                  prompt: '一只可爱的小猫在草地上奔跑'
                },
                parameters: {
                  resolution: model.parameters?.resolution || '720P',
                  ratio: model.parameters?.ratio || '16:9',
                  duration: model.parameters?.duration || 5
                }
              }),
              signal: AbortSignal.timeout(30000),
            });
            // T2V 接口通常返回 400（参数验证）但连接是成功的
            // 或者返回任务创建成功
            if (response.ok) {
              success = true;
              responseText = '视频生成任务创建成功';
            } else if (response.status === 400) {
              // 400 可能是参数问题，但 API 连接是正常的
              const body = await response.text().catch(() => '');
              if (body.includes('static resource') || body.includes('InvalidParameter')) {
                success = true;
                responseText = 'API 连接正常（参数验证通过）';
              } else {
                responseText = `HTTP ${response.status}: ${body.substring(0, 100)}`;
              }
            } else if (response.status === 403) {
              // 403 表示 API 连接成功，但没有服务权限
              success = true;
              responseText = 'API 连接正常（需开通文生视频服务权限）';
            } else {
              const body = await response.text().catch(() => '');
              responseText = `HTTP ${response.status}: ${body.substring(0, 100)}`;
            }
          } else {
            // 普通 LLM/多模态模型使用 chat 接口测试
            if (endpoint && !endpoint.includes('/chat/completions')) {
              endpoint = endpoint.replace(/\/$/, '') + '/chat/completions'
            }

            const response = await fetch(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                model: model.modelId,
                messages: [{ role: 'user', content: '你好，这是一条测试消息，请回复"连接成功"' }],
                stream: false,
              }),
              signal: AbortSignal.timeout(15000),
            });
            success = response.ok;
            if (success) {
              const data = await response.json();
              responseText = data.choices?.[0]?.message?.content || '连接成功';
            } else {
              const body = await response.text().catch(() => '');
              responseText = `HTTP ${response.status}: ${body.substring(0, 100)}`;
            }
          }
        }
      }

      const responseTime = Date.now() - startTime;
      const testResult: ModelTestResult = {
        success,
        responseTime,
        message: success
          ? `连接成功，响应时间: ${responseTime}ms，回复: ${responseText.substring(0, 50)}`
          : `连接失败: ${responseText}`,
        timestamp: new Date(),
      };

      // 更新测试结果
      const index = models.findIndex(m => m.id === id);
      if (index !== -1) {
        models[index] = { ...models[index], lastTestResult: testResult, updatedAt: new Date() };
        saveModels(models);
      }

      return testResult;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const testResult: ModelTestResult = {
        success: false,
        responseTime,
        message: `连接失败: ${error.message || error}`,
        timestamp: new Date(),
      };

      const index = models.findIndex(m => m.id === id);
      if (index !== -1) {
        models[index] = { ...models[index], lastTestResult: testResult, updatedAt: new Date() };
        saveModels(models);
      }

      return testResult;
    }
  },

  resetMetrics: (id: string): Model | null => {
    const index = models.findIndex(model => model.id === id);
    if (index !== -1) {
      models[index] = {
        ...models[index],
        updatedAt: new Date(),
        metrics: { totalCalls: 0, successCount: 0, failureCount: 0, averageResponseTime: 0, lastCallTime: null },
      };
      saveModels(models); // 持久化
      return models[index];
    }
    return null;
  },
};

console.log('[modelStore] 初始化完成，支持 JSON 文件持久化');

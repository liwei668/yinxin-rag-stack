// AI 客户端 - API Key 管理和 AI 调用
// 从 agentEngine.ts 拆分

// C2 修复：限制 AI 对话历史长度
export const MAX_AI_HISTORY_ROUNDS = 10; // 最多保留最近 10 轮对话
export const MAX_AI_CALLS_PER_TASK = 30; // 每个任务最多 30 次 AI 调用

// ========== 响应缓存（优化响应速度和Token消耗）==========
class AICacheService {
  private cache = new Map<string, { content: string; timestamp: number }>();
  private readonly TTL = 3600000; // 1小时缓存
  private readonly MAX_SIZE = 1000; // 最大缓存条目数

  get(messages: any[]): string | null {
    const key = this.hash(messages);
    const item = this.cache.get(key);
    if (item && Date.now() - item.timestamp < this.TTL) {
      console.log('[Agent Cache] 命中缓存');
      return item.content;
    }
    return null;
  }

  set(messages: any[], content: string): void {
    const key = this.hash(messages);
    
    // 限制缓存大小
    if (this.cache.size >= this.MAX_SIZE) {
      // 删除最早的条目
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      this.cache.delete(oldest[0]);
    }
    
    this.cache.set(key, { content, timestamp: Date.now() });
  }

  private hash(obj: any): string {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}

export const aiCache = new AICacheService();

// ========== HTTP连接复用（优化响应速度）==========
import * as http from 'http';
import * as https from 'https';
import { performanceMonitor } from './performanceMonitor';

export const httpAgent = new http.Agent({ 
  keepAlive: true, 
  maxSockets: 10,
  timeout: 30000 
});

export const httpsAgent = new https.Agent({ 
  keepAlive: true, 
  maxSockets: 10,
  timeout: 30000 
});

// C6 修复：统一 API Key 管理
export function getApiKey(isMultimodal = false): string {
  if (isMultimodal) {
    const key = process.env.DASHSCOPE_API_KEY;
    if (!key) {
      console.warn('[Agent] DASHSCOPE_API_KEY 环境变量未设置，多模态 AI 调用将失败');
    }
    return key || '';
  }
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    console.warn('[Agent] DEEPSEEK_API_KEY 环境变量未设置，AI 调用将失败');
  }
  return key || '';
}

// 使用 http/https 模块实现连接复用的请求函数
async function makeRequest(url: string, headers: Record<string, string>, body: string, agent: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: headers,
      agent: agent,
    };
    
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode || 500, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode || 500, data: { error: data } });
        }
      });
    });
    
    req.on('error', (e) => {
      reject(e);
    });
    
    req.write(body);
    req.end();
  });
}

export async function callAI(messages: { role: string; content: string | any[] }[], maxTokens = 2000): Promise<string> {
  // 检测是否包含图片（多模态消息）
  const hasImage = messages.some(m => Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image_url'));
  
  // 多模态请求不缓存（图片内容难以哈希）
  if (!hasImage) {
    const cached = aiCache.get(messages);
    if (cached) {
      return cached;
    }
  }
  
  const apiKey = getApiKey(hasImage);
  if (!apiKey) {
    console.error('[Agent] 无法调用 AI：API Key 未配置');
    return '';
  }

  try {
    // 多模态时使用 qwen-vl-max，纯文本使用 deepseek-chat
    const model = hasImage ? 'qwen-vl-max' : 'deepseek-v4-flash';
    const baseUrl = hasImage ? 'https://dashscope.aliyuncs.com/compatible-mode/v1' : 'https://api.deepseek.com';
    const url = `${baseUrl}/chat/completions`;

    console.log(`[Agent] 调用 AI (${hasImage ? '多模态' : '纯文本'}): ${model}`);

    const isHttps = baseUrl.startsWith('https');
    const agent = isHttps ? httpsAgent : httpAgent;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    
    const body = JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
    });

    const response = await performanceMonitor.track('AI_Call', () => 
      makeRequest(url, headers, body, agent)
    );
    const content = response.data.choices?.[0]?.message?.content || '';
    if (!content) {
      console.error('[Agent] AI 返回为空:', JSON.stringify(response.data).substring(0, 300));
    }
    
    // 缓存纯文本响应
    if (!hasImage && content) {
      aiCache.set(messages, content);
    }
    
    return content;
  } catch (error: any) {
    performanceMonitor.recordError('AI_Call', error);
    console.error('[Agent] AI 调用失败:', error.message);
    return '';
  }
}

export function trimAIHistory(history: { role: string; content: string }[]): { role: string; content: string }[] {
  if (history.length <= MAX_AI_HISTORY_ROUNDS * 2 + 1) return history; // +1 for system prompt
  // 保留 system prompt + 最近 N 轮
  const systemPrompt = history[0]; // 第一条是 system
  const recentRounds = history.slice(-(MAX_AI_HISTORY_ROUNDS * 2));
  return [systemPrompt, ...recentRounds];
}

import type { SpeechConfig } from './textToSpeechService';

const RETRYABLE_STATUS_CODES = [429, 500, 502, 503];
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 2000];

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // 检查是否为网络超时
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return true;
    }
    // 检查错误消息中是否包含可重试的状态码
    for (const code of RETRYABLE_STATUS_CODES) {
      if (error.message.includes(`${code}`)) {
        return true;
      }
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class TTSProviders {
  static async synthesize(text: string, cloudConfig: SpeechConfig['cloudConfig']): Promise<Blob> {
    if (!cloudConfig) {
      throw new Error('未配置云端语音识别参数');
    }

    // 前端先截断，双重保障（后端也有兜底）
    const MAX_TTS_LENGTH = 570;
    console.log('[TTS] 前端原始文本长度:', text.length);
    if (text.length > MAX_TTS_LENGTH) {
      text = text.substring(0, MAX_TTS_LENGTH);
      console.log('[TTS] 前端截断后长度:', text.length);
    }
    
    // 最终安全截断，确保严格不超过570字符
    if (text.length > 570) {
      text = text.substring(0, 570);
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        switch (cloudConfig.provider) {
          case 'aliyun':
            return await this.synthesizeWithAliyun(text, cloudConfig);
          case 'openai':
            return await this.synthesizeWithOpenAI(text, cloudConfig);
          case 'azure':
            return await this.synthesizeWithAzure(text, cloudConfig);
          case 'baidu':
            return await this.synthesizeWithBaidu(text, cloudConfig);
          case 'tencent':
            return await this.synthesizeWithTencent(text, cloudConfig);
          default:
            throw new Error('不支持的语音合成服务提供商');
        }
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES && isRetryableError(error)) {
          const delay = RETRY_DELAYS[attempt] || 2000;
          console.warn(`TTS 合成失败 (第 ${attempt + 1} 次)，${delay}ms 后重试...`, error);
          await sleep(delay);
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  private static async synthesizeWithAliyun(text: string, config: SpeechConfig['cloudConfig']): Promise<Blob> {
    // 后端从 configs.json + apis.json 读取 API 密钥，前端只需传文本和语音参数
    const requestBody = {
      text: text,
      provider: 'aliyun',
      voiceName: config.voiceName || 'Cherry',
      voiceRate: config.voiceRate || 1.0,
      voicePitch: config.voicePitch || 1.0
    };

    try {
      const response = await fetch('/api/speech/synthesis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`阿里云语音合成失败: ${response.status} - ${error}`);
      }

      return await response.blob();
    } catch (error) {
      throw error;
    }
  }

  private static async synthesizeWithOpenAI(text: string, config: SpeechConfig['cloudConfig']): Promise<Blob> {
    // 后端从 configs.json + apis.json 读取 API 密钥
    const requestBody = {
      text: text,
      provider: 'openai',
      voiceName: config.voiceName || 'alloy',
      voiceRate: config.voiceRate || 1.0
    };

    const response = await fetch('/api/speech/synthesis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI语音合成失败: ${response.status} - ${error}`);
    }

    return await response.blob();
  }

  private static async synthesizeWithAzure(text: string, config: SpeechConfig['cloudConfig']): Promise<Blob> {
    // 后端从 configs.json + apis.json 读取 API 密钥和端点
    const requestBody = {
      text: text,
      provider: 'azure',
      voiceName: config.voiceName || 'zh-CN-YunxiNeural'
    };

    const response = await fetch('/api/speech/synthesis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Azure语音合成失败: ${response.status} - ${error}`);
    }

    return await response.blob();
  }

  private static async synthesizeWithBaidu(text: string, config: SpeechConfig['cloudConfig']): Promise<Blob> {
    // 后端从 configs.json + apis.json 读取 API 密钥
    const requestBody = {
      text: text,
      provider: 'baidu',
      voiceRate: config.voiceRate || 5,
      voicePitch: config.voicePitch || 5
    };

    const response = await fetch('/api/speech/synthesis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`百度语音合成失败: ${response.status} - ${error}`);
    }

    return await response.blob();
  }

  private static async synthesizeWithTencent(text: string, config: SpeechConfig['cloudConfig']): Promise<Blob> {
    // 后端从 configs.json + apis.json 读取 API 密钥和端点
    const requestBody = {
      text: text,
      provider: 'tencent',
      voiceName: config.voiceName || '1001',
      voiceRate: config.voiceRate || 0
    };

    const response = await fetch('/api/speech/synthesis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`腾讯云语音合成失败: ${response.status} - ${error}`);
    }

    return await response.blob();
  }
}

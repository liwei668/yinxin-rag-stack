import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getRateLimitKey } from '../../../lib/rateLimit'
import fs from 'fs'
import path from 'path'
import { logger } from '../../../src/lib/logger';

// 从 apis.json 获取 API 配置
function getApiConfig(apiId: string) {
  try {
    const apisPath = path.join(process.cwd(), 'data', 'apis.json')
    const apis = JSON.parse(fs.readFileSync(apisPath, 'utf8'))
    return apis.find((a: any) => a.api_id === apiId)
  } catch (e) {
    return null
  }
}

// 从 configs.json 获取语音配置
function getVoiceConfig() {
  try {
    const configsPath = path.join(process.cwd(), 'data', 'configs.json')
    const configs = JSON.parse(fs.readFileSync(configsPath, 'utf8'))
    return configs.voice || {}
  } catch (e) {
    return {}
  }
}

export async function POST(request: NextRequest) {
  // 限流检查：每分钟最多 20 次请求
  const rlKey = getRateLimitKey(request, 'speech')
  const { limited, retryAfterMs } = rateLimit(rlKey, { windowMs: 60000, maxRequests: 20 })
  if (limited) {
    return NextResponse.json(
      { error: `请求过于频繁，请 ${Math.ceil(retryAfterMs / 1000)} 秒后重试` },
      { status: 429 }
    )
  }

  try {
    const contentType = request.headers.get('content-type');
    let audioFile: File | null = null;
    let audioUrl: string | null = null;
    let provider: string | null = null;
    let endpoint: string | null = null;
    let modelName: string | null = null;

    // 读取语音全局配置
    const voiceConfig = getVoiceConfig();

    if (contentType?.includes('application/json')) {
      const jsonBody = await request.json();

      provider = jsonBody.provider || voiceConfig.asrEngine || 'aliyun';
      endpoint = jsonBody.endpoint;
      modelName = jsonBody.modelName || 'qwen3-asr-flash';

      if (jsonBody.audio) {
        try {
          const base64Audio = jsonBody.audio;
          const format = jsonBody.format || 'webm';
          const binaryString = atob(base64Audio);
          const arrayBuffer = new ArrayBuffer(binaryString.length);
          const uint8Array = new Uint8Array(arrayBuffer);
          for (let i = 0; i < binaryString.length; i++) {
            uint8Array[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([arrayBuffer], { type: `audio/${format}` });
          audioFile = new File([blob], `audio.${format}`, { type: `audio/${format}` });
        } catch (error) {
          logger.error('SYSTEM', 'Error processing base64 audio', { extra: { error: String(error) } });
          return NextResponse.json(
            { error: 'Invalid base64 audio data' },
            { status: 400 }
          );
        }
      } else if (jsonBody.url) {
        audioUrl = jsonBody.url;
      }
    } else {
      const formData = await request.formData();
      audioFile = formData.get('file') as File;
      provider = formData.get('provider') as string;
      endpoint = formData.get('endpoint') as string;
      modelName = formData.get('modelName') as string;
    }

    let apiKey = process.env.DASHSCOPE_API_KEY

    // 从 apis.json 获取 API 密钥和端点
    const voiceApiId = voiceConfig.voiceApiId
    if (voiceApiId) {
      const apiConfig = getApiConfig(voiceApiId)
      if (apiConfig) {
        if (!apiKey) apiKey = apiConfig.apiKey
        if (!endpoint) endpoint = apiConfig.baseUrl
      }
    }

    if ((!audioFile && !audioUrl) || !provider) {
      return NextResponse.json(
        { error: `Missing required parameters: file=${!!audioFile}, url=${audioUrl}, provider=${provider}` },
        { status: 400 }
      )
    }

    if (!apiKey) {
      logger.error('SYSTEM', 'API Key not found in environment variables')
      return NextResponse.json(
        { error: 'API Key not configured' },
        { status: 500 }
      )
    }

    switch (provider) {
      case 'aliyun':
        return await transcribeWithAliyun(audioFile, audioUrl, apiKey, endpoint, modelName)
      case 'openai':
        return await transcribeWithOpenAI(audioFile, apiKey, modelName)
      default:
        return NextResponse.json(
          { error: 'Unsupported provider' },
          { status: 400 }
        )
    }
  } catch (error) {
    logger.error('SYSTEM', 'Speech API error', { extra: { error: String(error) } })
    return NextResponse.json(
      { error: `Speech recognition failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}

async function transcribeWithAliyun(
  audioFile: File | null,
  audioUrl: string | null,
  apiKey: string,
  endpoint: string,
  modelName: string
) {
  try {
    const apiUrl = endpoint || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

    let audioDataUrl: string;

    if (audioFile) {
      const mimeType = audioFile.type || 'audio/wav';
      const audioBuffer = await audioFile.arrayBuffer();
      const base64Audio = Buffer.from(audioBuffer).toString('base64');
      audioDataUrl = `data:${mimeType};base64,${base64Audio}`;
    } else if (audioUrl) {
      audioDataUrl = audioUrl;
    } else {
      throw new Error('No audio source provided');
    }

    const requestBody = {
      model: modelName || 'qwen3-asr-flash',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { audio: audioDataUrl }
            ]
          }
        ]
      }
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`DashScope ASR API error: ${response.status} - ${responseText}`);
    }

    const data = JSON.parse(responseText);

    // 解析 ChatML 响应格式: output.choices[0].message.content
    const content = data?.output?.choices?.[0]?.message?.content;
    if (content) {
      if (typeof content === 'string') {
        return NextResponse.json({ text: content });
      } else if (Array.isArray(content)) {
        const textParts = content.filter((c: any) => c.type === 'text').map((c: any) => c.text);
        if (textParts.length > 0) {
          return NextResponse.json({ text: textParts.join('') });
        }
        const allText = content.map((c: any) => c.text || JSON.stringify(c)).join('');
        return NextResponse.json({ text: allText });
      }
    }

    // 兼容旧格式
    if (data.output && data.output.text) {
      return NextResponse.json({ text: data.output.text });
    } else if (data.result) {
      return NextResponse.json({ text: data.result });
    } else if (data.text) {
      return NextResponse.json({ text: data.text });
    } else {
      throw new Error('Invalid response format: no text found');
    }
  } catch (error) {
    logger.error('SYSTEM', 'DashScope transcription error', { extra: { error: String(error) } });
    throw error;
  }
}

async function transcribeWithOpenAI(
  audioFile: File,
  apiKey: string,
  modelName: string
) {
  const form = new FormData()
  form.append('file', audioFile)
  form.append('model', modelName || 'whisper-1')
  form.append('language', 'zh')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: form,
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('SYSTEM', 'OpenAI API error', { extra: { error: String(response.status), arg1: String(error) } })
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data = await response.json()
  return NextResponse.json({ text: data.text })
}

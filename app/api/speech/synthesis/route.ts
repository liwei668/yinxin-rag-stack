import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { logger } from '../../../../src/lib/logger';

/**
 * 将文本截断到 maxLength 以内，优先在句号/标点处断开
 */
function truncateTextForTTS(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  const sentenceEndChars = ['。', '！', '？', '.', '!', '?', '\n']
  for (let i = maxLength - 1; i >= maxLength * 0.5; i--) {
    if (sentenceEndChars.includes(text[i])) {
      return text.substring(0, i + 1)
    }
  }

  const punctuationChars = ['，', ',', '；', ';', '、', ' ']
  for (let i = maxLength - 1; i >= maxLength * 0.5; i--) {
    if (punctuationChars.includes(text[i])) {
      return text.substring(0, i + 1)
    }
  }

  return text.substring(0, maxLength)
}

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
  try {
    const body = await request.json()
    let { text } = body

    // 读取语音全局配置
    const voiceConfig = getVoiceConfig()
    console.log('[TTS] voiceConfig:', voiceConfig)
    const provider = voiceConfig.ttsEngine || body.provider || 'aliyun'
    const modelName = voiceConfig.ttsModel || body.modelName
    const voiceName = voiceConfig.voiceName || body.voiceName
    const voiceRate = voiceConfig.voiceSpeed || body.voiceRate || 1.0
    const voicePitch = body.voicePitch || 1.0
    console.log('[TTS] using voiceName:', voiceName)

    // 从 apis.json 获取 API 密钥和端点
    const voiceApiId = voiceConfig.voiceApiId
    let apiKey = body.apiKey
    let endpoint = body.endpoint

    if (voiceApiId) {
      const apiConfig = getApiConfig(voiceApiId)
      if (apiConfig) {
        apiKey = apiKey || apiConfig.apiKey
        endpoint = endpoint || apiConfig.baseUrl
      }
    }

    // 回退到环境变量
    if (!apiKey) {
      apiKey = process.env.DASHSCOPE_API_KEY
    }

    if (!text) {
      return NextResponse.json({ error: 'Missing required parameter: text' }, { status: 400 })
    }

    if (!text.trim()) {
      return NextResponse.json({ error: 'Text is empty after cleaning' }, { status: 400 })
    }

    // 后端兜底：确保文本不超过 TTS API 的单次请求限制（严格<600）
    const MAX_TTS_LENGTH = 570
    console.log('[TTS] 后端接收文本长度:', text.length)
    if (text.length > MAX_TTS_LENGTH) {
      text = truncateTextForTTS(text, MAX_TTS_LENGTH)
      console.log('[TTS] 后端截断后长度:', text.length)
    }
    
    // 最终安全截断，确保严格不超过570字符
    if (text.length > 570) {
      text = text.substring(0, 570)
      console.log('[TTS] 最终安全截断到:', text.length)
    }

    if (!apiKey) {
      return NextResponse.json({ error: '语音 API Key 未配置，请在全局参数 > 语音设置中配置 API' }, { status: 500 })
    }

    try {
      switch (provider) {
        case 'aliyun':
          return await synthesizeWithAliyun(text, apiKey, endpoint, modelName, voiceName, voiceRate, voicePitch)
        case 'openai':
          return await synthesizeWithOpenAI(text, apiKey, voiceName, voiceRate)
        case 'azure':
          return await synthesizeWithAzure(text, apiKey, endpoint, voiceName)
        case 'baidu':
          return await synthesizeWithBaidu(text, apiKey, voiceRate, voicePitch)
        case 'tencent':
          return await synthesizeWithTencent(text, apiKey, endpoint, voiceName, voiceRate)
        default:
          logger.error('SYSTEM', 'Unsupported provider', { extra: { error: String(provider) } })
          return NextResponse.json(
            { error: 'Unsupported provider' },
            { status: 400 }
          )
      }
    } catch (error) {
      logger.error('SYSTEM', 'Synthesis provider error', { extra: { error: String(error) } })
      throw error
    }
  } catch (error) {
    logger.error('SYSTEM', 'Speech synthesis API error', { extra: { error: String(error) } })
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Speech synthesis failed: ${message}` },
      { status: 500 }
    )
  }
}

async function synthesizeWithAliyun(
  text: string,
  apiKey: string,
  endpoint: string,
  modelName: string,
  voiceName: string,
  voiceRate: number,
  voicePitch: number
) {
  try {
    // 使用阿里云官方的TTS API端点
    const model = modelName || 'qwen3-tts-instruct-flash'

    // 兼容旧格式音色名称映射
    const voiceMap: Record<string, string> = {
      'xiaobai': 'Cherry',
      'yunlong': 'Ethan',
      'huangying': 'Serena',
      'meiqi': 'Chelsie',
      'qingchen': 'Cherry',
      'zhixiaobai': 'Cherry',
      'zhiyunlong': 'Ethan',
      'zhihuangying': 'Serena',
      'zhimeiqi': 'Chelsie',
      'zhiqingchen': 'Cherry'
    }

    let voice = voiceName || 'Cherry'
    if (voiceMap[voice]) {
      voice = voiceMap[voice]
    }
    // qwen3-tts 系列官方支持的系统音色
    const supportedVoices = ['Cherry', 'Serena', 'Ethan', 'Chelsie']
    if (!supportedVoices.includes(voice)) {
      logger.warn('AI_API', '音色', { extra: { error: String(voice), error: String('不支持，回退到 Cherry') } })
      voice = 'Cherry'
    }

    // DashScope Qwen-TTS API（官方 HTTP 接口）
    const apiUrl = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

    // 语速转指令（仅 instruct 模型支持）
    const isInstructModel = model.includes('instruct')
    let instructions: string | undefined
    if (isInstructModel && voiceRate !== 1.0) {
      if (voiceRate <= 0.5) instructions = '语速很慢'
      else if (voiceRate <= 0.8) instructions = '语速稍慢'
      else if (voiceRate <= 1.2) instructions = '正常语速'
      else if (voiceRate <= 1.5) instructions = '语速稍快'
      else if (voiceRate <= 2.0) instructions = '语速很快'
      else instructions = '语速极快'
    }

    const requestBody: any = {
      model: model,
      input: {
        text: text,
        voice: voice,
      },
    }

    if (isInstructModel) {
      requestBody.input.language_type = 'Chinese'
      if (instructions) {
        requestBody.input.instructions = instructions
        requestBody.optimize_instructions = true
      }
    }

    console.log('[TTS] request:', JSON.stringify(requestBody, null, 2))

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('SYSTEM', 'TTS API error', { extra: { error: String(errorText) } })
      throw new Error(`DashScope TTS API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    // qwen3-tts-flash API响应格式
    if (data.output && data.output.audio && data.output.audio.data) {
      // 返回的是base64编码的音频数据
      const audioBase64 = data.output.audio.data
      const audioBuffer = Buffer.from(audioBase64, 'base64')
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': audioBuffer.byteLength.toString(),
        },
      })
    }

    // 多模态生成API的响应格式（兼容旧版本）
    if (data.output?.audio?.url) {
      const audioResponse = await fetch(data.output.audio.url)
      if (!audioResponse.ok) {
        throw new Error(`Failed to download audio: ${audioResponse.status}`)
      }
      const audioBuffer = await audioResponse.arrayBuffer()
      return new NextResponse(Buffer.from(audioBuffer), {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': audioBuffer.byteLength.toString(),
        },
      })
    }

    throw new Error('No audio data in response: ' + JSON.stringify(data).substring(0, 300))
  } catch (error) {
    logger.error('SYSTEM', 'DashScope synthesis error', { extra: { error: String(error) } })
    throw error
  }
}

async function synthesizeWithOpenAI(
  text: string,
  apiKey: string,
  voiceName: string,
  voiceRate: number
) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voiceName || 'alloy',
      speed: voiceRate || 1.0
    })
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('SYSTEM', 'OpenAI TTS API error', { extra: { error: String(response.status), arg1: String(error) } })
    throw new Error(`OpenAI TTS API error: ${response.status}`)
  }

  const blob = await response.blob()
  const arrayBuffer = await blob.arrayBuffer()

  return new NextResponse(arrayBuffer, {
    headers: {
      'Content-Type': blob.type,
      'Content-Length': blob.size.toString()
    }
  })
}

async function synthesizeWithAzure(
  text: string,
  apiKey: string,
  endpoint: string,
  voiceName: string
) {
  if (!endpoint) {
    throw new Error('Azure endpoint is required')
  }

  const response = await fetch(`${endpoint}/speech/synthesize/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
    },
    body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
      <voice name="${voiceName || 'zh-CN-YunxiNeural'}">
        ${text}
      </voice>
    </speak>`
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('SYSTEM', 'Azure TTS API error', { extra: { error: String(response.status), arg1: String(error) } })
    throw new Error(`Azure TTS API error: ${response.status}`)
  }

  const blob = await response.blob()
  const arrayBuffer = await blob.arrayBuffer()

  return new NextResponse(arrayBuffer, {
    headers: {
      'Content-Type': blob.type,
      'Content-Length': blob.size.toString()
    }
  })
}

async function synthesizeWithBaidu(
  text: string,
  apiKey: string,
  voiceRate: number,
  voicePitch: number
) {
  const formData = new URLSearchParams({
    tex: text,
    tok: apiKey,
    ctp: '1',
    lan: 'zh',
    spd: (voiceRate || 5).toString(),
    pit: (voicePitch || 5).toString(),
    vol: '5',
    per: '0'
  })

  const response = await fetch('https://tsn.baidu.com/text2audio', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('SYSTEM', 'Baidu TTS API error', { extra: { error: String(response.status), arg1: String(error) } })
    throw new Error(`Baidu TTS API error: ${response.status}`)
  }

  const blob = await response.blob()
  const arrayBuffer = await blob.arrayBuffer()

  return new NextResponse(arrayBuffer, {
    headers: {
      'Content-Type': blob.type,
      'Content-Length': blob.size.toString()
    }
  })
}

async function synthesizeWithTencent(
  text: string,
  apiKey: string,
  endpoint: string,
  voiceName: string,
  voiceRate: number
) {
  if (!endpoint) {
    throw new Error('Tencent endpoint is required')
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      Text: text,
      VoiceType: voiceName || '1001',
      Speed: voiceRate || 0,
      Volume: 10,
      ProjectId: 0,
      ModelType: 1,
      PrimaryLanguage: 1
    })
  })

  if (!response.ok) {
    const error = await response.text()
    logger.error('SYSTEM', 'Tencent TTS API error', { extra: { error: String(response.status), arg1: String(error) } })
    throw new Error(`Tencent TTS API error: ${response.status}`)
  }

  const blob = await response.blob()
  const arrayBuffer = await blob.arrayBuffer()

  return new NextResponse(arrayBuffer, {
    headers: {
      'Content-Type': blob.type,
      'Content-Length': blob.size.toString()
    }
  })
}

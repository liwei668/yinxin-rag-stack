import { NextRequest, NextResponse } from 'next/server'
import { modelStore } from '../../../src/lib/modelStore'
import { logger } from '../../../src/lib/logger'

/**
 * Vision API - 支持多模态模型图片识别
 * 支持模型：qwen3-vl-plus, qwen-vl-max, deepseek-vl, ollama qwen2.5vl
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const message = (formData.get('message') as string) || '请识别并描述这张图片的内容'
    const imageUrl = formData.get('imageUrl') as string | null
    const modelId = (formData.get('model') as string) || 'qwen3-vl-plus'  // 默认使用 qwen3-vl-plus

    if (!file && !imageUrl) {
      return NextResponse.json(
        { error: '请上传图片或提供图片URL' },
        { status: 400 }
      )
    }

    let base64Image: string | undefined
    let mimeType = 'image/jpeg'

    if (file) {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      base64Image = buffer.toString('base64')
      
      if (file.type) {
        mimeType = file.type
      } else if (file.name.endsWith('.png')) {
        mimeType = 'image/png'
      } else if (file.name.endsWith('.webp')) {
        mimeType = 'image/webp'
      } else if (file.name.endsWith('.gif')) {
        mimeType = 'image/gif'
      }
    }

    // 获取模型配置
    const allModels = modelStore.getAll()
    const modelConfig = allModels.find((m: any) => m.modelId === modelId || m.id === modelId)

    let result: any
    let usedModel = modelId

    if (modelConfig?.provider === 'ollama') {
      // Ollama 本地模型
      result = await callOllamaVision({
        base64Image,
        imageUrl,
        message,
        modelId: modelConfig.modelId || 'qwen2.5vl:7b'
      })
      usedModel = modelConfig.modelId || 'qwen2.5vl:7b'
    } else if (modelConfig?.provider === 'dashscope') {
      // 阿里云 DashScope（qwen3-vl-plus, qwen-vl-max）
      result = await callDashScopeVision({
        base64Image,
        imageUrl,
        message,
        mimeType,
        modelId: modelConfig.modelId || 'qwen3-vl-plus'
      })
      usedModel = modelConfig.modelId || 'qwen3-vl-plus'
    } else {
      // 默认使用 DashScope
      result = await callDashScopeVision({
        base64Image,
        imageUrl,
        message,
        mimeType,
        modelId: 'qwen3-vl-plus'
      })
      usedModel = 'qwen3-vl-plus'
    }

    const content = result?.choices?.[0]?.message?.content || '无法识别图片内容'

    return NextResponse.json({
      success: true,
      content,
      model: usedModel
    })
  } catch (error: any) {
    logger.error('SYSTEM', '[Vision API] Error', { extra: { error: String(error) } })
    return NextResponse.json(
      { error: error.message || '图片识别失败' },
      { status: 500 }
    )
  }
}

/**
 * 调用 DashScope 视觉模型
 */
async function callDashScopeVision(params: {
  base64Image?: string
  imageUrl?: string | null
  message: string
  mimeType: string
  modelId: string
}) {
  const { base64Image, imageUrl, message, mimeType, modelId } = params
  const apiKey = process.env.DASHSCOPE_API_KEY || ''

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
    throw new Error('请提供图片')
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

  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      messages: messages,
      stream: false
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('AI_API', `[DashScope Vision] API 错误: ${response.status}`, { extra: { error: errorText } })
    throw new Error(`视觉模型请求失败: ${response.status}`)
  }

  return await response.json()
}

/**
 * 调用 Ollama 本地视觉模型
 */
async function callOllamaVision(params: {
  base64Image?: string
  imageUrl?: string | null
  message: string
  modelId: string
}) {
  const { base64Image, imageUrl, message, modelId } = params

  // Ollama 需要图片的 base64（不带前缀）
  let imageData = base64Image
  if (imageUrl && !base64Image) {
    // 如果只有 URL，需要下载图片
    const response = await fetch(imageUrl)
    const buffer = Buffer.from(await response.arrayBuffer())
    imageData = buffer.toString('base64')
  }

  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: 'user',
          content: message,
          images: imageData ? [imageData] : undefined
        }
      ],
      stream: false
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('AI_API', `[Ollama Vision] API 错误: ${response.status}`, { extra: { error: errorText } })
    throw new Error(`Ollama 视觉模型请求失败: ${response.status}`)
  }

  const data = await response.json()
  
  // 转换为 OpenAI 兼容格式
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: data.message?.content || ''
      }
    }]
  }
}

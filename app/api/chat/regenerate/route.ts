import { NextRequest, NextResponse } from 'next/server'
import { modelStore } from '../../../../src/lib/modelStore'
import { callAPI } from '../../../../src/api/apiManager'
import { logger } from '../../../../src/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { messageId, conversationId, history, model: modelId } = await request.json()

    if (!messageId || !history || history.length === 0) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      )
    }

    // 获取模型配置
    let modelConfig = modelId
      ? modelStore.getById(modelId)
      : modelStore.getDefault('llm')

    // 如果按 id 没找到，尝试按 modelId 字段查找
    if (!modelConfig && modelId) {
      const allModels = modelStore.getAll()
      modelConfig = allModels.find((m: any) => m.modelId === modelId) || null
    }

    // 最终兜底
    if (!modelConfig) {
      modelConfig = modelStore.getDefault('llm')
    }

    if (!modelConfig) {
      return NextResponse.json(
        { error: '模型未找到' },
        { status: 404 }
      )
    }

    // 构建消息：取最后一条用户消息作为当前输入，之前的作为历史
    const lastUserMsg = history[history.length - 1]
    const previousHistory = history.slice(0, -1).map((msg: any) => ({
      role: msg.role,
      content: msg.content
    }))

    // 调用 AI 生成新回复
    const apiId = modelConfig.apiId || 'deepseek-api'
    const response = await callAPI(apiId, 'chat', {
      message: lastUserMsg.content,
      history: previousHistory,
      model: modelConfig.modelId || modelId,
      parameters: modelConfig.parameters || {},
      customPrompt: modelConfig.customPrompt || '',
    })

    // 提取回复内容
    const content = response?.choices?.[0]?.message?.content ||
                   response?.content ||
                   (typeof response === 'string' ? response : '') ||
                   '生成失败，请重试'

    return NextResponse.json({
      success: true,
      content,
      messageId
    })

  } catch (error) {
    logger.error('CHAT', '错误', { extra: { error: String(error) } })
    return NextResponse.json(
      { error: '重新生成失败', details: String(error) },
      { status: 500 }
    )
  }
}

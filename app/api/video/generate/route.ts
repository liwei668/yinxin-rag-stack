import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import path from 'path'
import { logger } from '../../../../src/lib/logger';

// 读取 API 配置
function getT2VApiKey(): string {
  try {
    const apisPath = path.join(process.cwd(), 'data', 'apis.json')
    const apis = JSON.parse(readFileSync(apisPath, 'utf-8'))
    const t2vApi = apis.find((a: any) => a.api_id === 'dashscope-t2v')
    if (!t2vApi || !t2vApi.isActive) {
      throw new Error('文生视频 API 未启用')
    }
    return t2vApi.apiKey
  } catch (e: any) {
    throw new Error(`无法读取文生视频配置: ${e.message}`)
  }
}

// 模型参数映射
const MODEL_CONFIG: Record<string, { resolution: string; duration: number }> = {
  'wan2.7-t2v': { resolution: '720P', duration: 5 },
  'happyhorse-1.0-t2v': { resolution: '1080P', duration: 5 },
}

// 简单敏感词过滤
const SENSITIVE_WORDS = ['暴力', '色情', '血腥', '恐怖', '枪击', '炸弹', '杀人', '自杀']
function containsSensitiveWord(text: string): boolean {
  return SENSITIVE_WORDS.some(w => text.includes(w))
}

// 单用户每日生成次数限制（内存存储，重启重置）
const dailyCounts = new Map<string, { date: string; count: number }>()
const DAILY_LIMIT = 10

function checkDailyLimit(userId: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  const record = dailyCounts.get(userId)
  if (!record || record.date !== today) {
    dailyCounts.set(userId, { date: today, count: 0 })
    return true
  }
  return record.count < DAILY_LIMIT
}

function incrementDailyCount(userId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const record = dailyCounts.get(userId)
  if (record && record.date === today) {
    record.count++
  } else {
    dailyCounts.set(userId, { date: today, count: 1 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, model = 'wan2.7-t2v', userId = 'default' } = await request.json()

    // 参数校验
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: '请输入视频描述' }, { status: 400 })
    }

    if (prompt.trim().length < 5) {
      return NextResponse.json({ error: '描述至少需要5个字' }, { status: 400 })
    }

    if (prompt.length > 2500) {
      return NextResponse.json({ error: '描述不能超过2500个字' }, { status: 400 })
    }

    // 模型校验
    if (!MODEL_CONFIG[model]) {
      return NextResponse.json({ error: `不支持的模型: ${model}` }, { status: 400 })
    }

    // 敏感词过滤
    if (containsSensitiveWord(prompt)) {
      return NextResponse.json({ error: '描述包含敏感内容，请修改后重试' }, { status: 400 })
    }

    // 每日次数限制
    if (!checkDailyLimit(userId)) {
      return NextResponse.json({ error: `今日生成次数已达上限（${DAILY_LIMIT}次），请明天再试` }, { status: 429 })
    }

    // 获取 API Key
    const apiKey = getT2VApiKey()

    // 模型参数
    const config = MODEL_CONFIG[model]

    // 调用阿里云文生视频接口
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model,
        input: { prompt: prompt.trim() },
        parameters: {
          resolution: config.resolution,
          ratio: '16:9',
          duration: config.duration,
          watermark: false,
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      logger.error('AI_API', '创建任务失败', { extra: { error: String(data) } })
      const errMsg = data.message || '创建视频生成任务失败'
      return NextResponse.json({ error: errMsg }, { status: response.status })
    }

    const taskId = data.output?.task_id
    if (!taskId) {
      logger.error('AI_API', '无 task_id', { extra: { error: String(data) } })
      return NextResponse.json({ error: '未获取到任务ID' }, { status: 500 })
    }

    // 计数
    incrementDailyCount(userId)

    console.log(`[文生视频] 任务创建成功: ${taskId}, 模型: ${model}, 分辨率: ${config.resolution}`)

    return NextResponse.json({
      task_id: taskId,
      model,
      resolution: config.resolution,
      duration: config.duration,
      message: '任务已提交，预计1-5分钟完成',
    })
  } catch (error: any) {
    logger.error('AI_API', '异常', { extra: { error: String(error) } })
    return NextResponse.json({ error: error.message || '服务器内部错误' }, { status: 500 })
  }
}

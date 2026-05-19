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

// 状态映射
const STATUS_MAP: Record<string, string> = {
  PENDING: '排队中',
  RUNNING: '生成中',
  SUCCEEDED: '生成成功',
  FAILED: '生成失败',
  CANCELED: '任务已取消',
  UNKNOWN: '任务不存在或已过期',
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('task_id')

    if (!taskId) {
      return NextResponse.json({ error: '缺少 task_id 参数' }, { status: 400 })
    }

    const apiKey = getT2VApiKey()

    const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      logger.error('AI_API', '查询任务失败', { extra: { error: String(data) } })
      return NextResponse.json({ error: '查询任务状态失败' }, { status: response.status })
    }

    const output = data.output || {}
    const taskStatus = output.task_status || 'UNKNOWN'

    return NextResponse.json({
      task_id: taskId,
      task_status: taskStatus,
      task_status_text: STATUS_MAP[taskStatus] || taskStatus,
      video_url: output.video_url || null,
      submit_time: output.submit_time || null,
      end_time: output.end_time || null,
      message: taskStatus === 'FAILED' ? (data.message || '生成失败，请重试') : undefined,
    })
  } catch (error: any) {
    logger.error('AI_API', '查询异常', { extra: { error: String(error) } })
    return NextResponse.json({ error: error.message || '服务器内部错误' }, { status: 500 })
  }
}

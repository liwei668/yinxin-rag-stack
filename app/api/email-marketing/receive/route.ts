import { NextRequest, NextResponse } from 'next/server'
import { receiveEmails } from '../../../../src/services/email-marketing/emailService'

// POST - 接收新邮件
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const config_id = searchParams.get('config_id')
    const limit = parseInt(searchParams.get('limit') || '20')

    if (!config_id) {
      return NextResponse.json(
        { error: '缺少邮箱配置ID' },
        { status: 400 }
      )
    }

    const result = await receiveEmails(config_id, limit)

    if (result.success) {
      return NextResponse.json({
        success: true,
        count: result.count,
        message: `成功接收 ${result.count} 封新邮件`
      })
    } else {
      return NextResponse.json(
        { error: result.error || '接收邮件失败' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('接收邮件接口异常', { error: String(error) })
    return NextResponse.json(
      { error: '接收邮件失败' },
      { status: 500 }
    )
  }
}

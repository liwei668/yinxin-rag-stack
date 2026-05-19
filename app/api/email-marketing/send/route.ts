import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '../../../../src/services/email-marketing/emailService'

// POST - 发送邮件
export async function POST(request: NextRequest) {
  try {
    const {
      config_id,
      to_address,
      to_name,
      cc_address,
      bcc_address,
      subject,
      content,
      html_content,
      template_id,
      signature_id
    } = await request.json()

    if (!config_id || !to_address || !subject || !content) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      )
    }

    const result = await sendEmail({
      config_id,
      to_address,
      to_name,
      cc_address,
      bcc_address,
      subject,
      content,
      html_content,
      template_id,
      signature_id
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        message_id: result.message_id,
        message: '邮件发送成功'
      })
    } else {
      return NextResponse.json(
        { error: result.error || '邮件发送失败' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('发送邮件接口异常', { error: String(error) })
    return NextResponse.json(
      { error: '邮件发送失败' },
      { status: 500 }
    )
  }
}

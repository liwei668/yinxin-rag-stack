import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../src/services/email-marketing/database'
import { processNewEmail } from '../../../../src/services/email-marketing/aiReplyService'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const config_id = searchParams.get('config_id')

    if (!config_id) {
      return NextResponse.json({ error: '缺少配置ID' }, { status: 400 })
    }

    const db = await getDB()
    
    const unprocessedEmails = db.prepare(`
      SELECT id FROM received_email 
      WHERE config_id = ? AND is_read = 0 AND is_spam = 0
      ORDER BY received_at DESC
      LIMIT 50
    `).all(config_id) as any[]

    const results = []
    for (const email of unprocessedEmails) {
      try {
        const result = await processNewEmail(email.id)
        results.push({
          email_id: email.id,
          ...result
        })
      } catch (error: any) {
        console.error(`处理邮件 ${email.id} 失败:`, error)
        results.push({
          email_id: email.id,
          processed: false,
          autoReplied: false,
          error: error.message
        })
      }
    }

    const processedCount = results.filter(r => r.processed).length
    const repliedCount = results.filter(r => r.autoReplied).length

    return NextResponse.json({
      success: true,
      total_emails: unprocessedEmails.length,
      processed_count: processedCount,
      auto_replied_count: repliedCount,
      results
    })
  } catch (error: any) {
    console.error('AI处理邮件失败:', error)
    return NextResponse.json(
      { error: error.message || 'AI处理邮件失败' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'AI邮件处理API',
    usage: 'POST /api/email-marketing/ai-process?config_id=xxx'
  })
}

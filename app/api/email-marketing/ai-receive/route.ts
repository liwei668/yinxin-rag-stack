import { NextRequest, NextResponse } from 'next/server'
import { receiveEmails } from '../../../../src/services/email-marketing/emailService'
import { processNewEmail } from '../../../../src/services/email-marketing/aiReplyService'
import { getDB } from '../../../../src/services/email-marketing/database'

// POST - 接收新邮件并自动处理AI回复
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const config_id = searchParams.get('config_id')
    const limit = parseInt(searchParams.get('limit') || '20')
    const autoReply = searchParams.get('autoReply') !== 'false' // 默认启用自动回复

    if (!config_id) {
      return NextResponse.json(
        { error: '缺少邮箱配置ID' },
        { status: 400 }
      )
    }

    // 接收新邮件
    const receiveResult = await receiveEmails(config_id, limit)

    if (!receiveResult.success) {
      return NextResponse.json(
        { error: receiveResult.error || '接收邮件失败' },
        { status: 500 }
      )
    }

    // 如果启用了自动回复，处理新邮件
    let autoReplyResults = []
    let stats = {
      total_processed: 0,
      auto_sent: 0,
      draft_saved: 0
    }
    
    if (autoReply && receiveResult.count > 0) {
      const db = await getDB()
      
      // 获取最新收到的邮件
      const recentEmails = db.prepare(`
        SELECT id FROM received_email 
        WHERE config_id = ? 
        AND ai_replied = 0
        ORDER BY received_at DESC 
        LIMIT ?
      `).all(config_id, receiveResult.count) as any[]

      // 处理每封新邮件
      for (const email of recentEmails) {
        try {
          const result = await processNewEmail(email.id, config_id)
          stats.total_processed++
          if (result.autoSent) stats.auto_sent++
          if (result.draftSaved) stats.draft_saved++
          
          autoReplyResults.push({ 
            email_id: email.id, 
            status: 'processed',
            auto_sent: result.autoSent,
            draft_saved: result.draftSaved
          })
        } catch (error: any) {
          console.error(`处理邮件 ${email.id} 失败:`, error)
          autoReplyResults.push({ email_id: email.id, status: 'failed', error: error.message })
        }
      }
    }

    return NextResponse.json({
      success: true,
      received_count: receiveResult.count,
      auto_reply_count: autoReplyResults.length,
      auto_reply_results: autoReplyResults,
      stats,
      message: receiveResult.count > 0 
        ? `成功接收 ${receiveResult.count} 封新邮件，自动发送 ${stats.auto_sent} 封，${stats.draft_saved} 封待审核`
        : '没有新邮件'
    })
  } catch (error: any) {
    console.error('接收并处理邮件失败:', error)
    return NextResponse.json(
      { error: error.message || '接收并处理邮件失败' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../../src/services/email-marketing/database'
import { receiveEmails } from '../../../../../src/services/email-marketing/emailService'
import { processNewEmail } from '../../../../../src/services/email-marketing/aiReplyService'

export async function POST(request: NextRequest) {
  try {
    let configIdFromBody: any = {}
    try {
      configIdFromBody = await request.json()
    } catch (e) {}
    
    const { searchParams } = new URL(request.url)
    const config_id = searchParams.get('config_id') || configIdFromBody.config_id

    const db = await getDB()
    
    let configs
    if (config_id) {
      configs = [db.prepare('SELECT * FROM email_config WHERE id = ? AND is_active = 1').get(config_id)]
    } else {
      configs = db.prepare('SELECT * FROM email_config WHERE is_active = 1 AND poll_enabled = 1').all()
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json({
        success: false,
        error: '没有启用的邮箱配置'
      }, { status: 400 })
    }

    const results: any[] = []
    const now = new Date().toLocaleString('zh-CN')

    for (const config of configs as any[]) {
      try {
        const receiveResult = await receiveEmails(config.id, 20)
        
        let stats = { total_processed: 0, auto_sent: 0, draft_saved: 0 }
        
        if (receiveResult.count > 0 && config.auto_reply_enabled === 1) {
          const recentEmails = db.prepare(`
            SELECT id FROM received_email 
            WHERE config_id = ? 
            AND ai_replied = 0
            ORDER BY received_at DESC 
            LIMIT ?
          `).all(config.id, receiveResult.count)
          
          for (const email of recentEmails) {
            try {
              const result = await processNewEmail(email.id, config.id)
              stats.total_processed++
              if (result.auto_sent) stats.auto_sent++
              if (result.draft_saved) stats.draft_saved++
            } catch (e) {
              console.error('处理邮件失败:', e)
            }
          }
        }
        
        db.prepare(`UPDATE email_config SET last_poll_at = datetime('now', 'localtime') WHERE id = ?`).run(config.id)

        results.push({
          config_id: config.id,
          email_address: config.email_address,
          status: 'success',
          received_count: receiveResult.count || 0,
          stats,
          error: receiveResult.error,
          polled_at: now
        })
      } catch (error: any) {
        console.error(`${config.email_address} 轮询失败:`, error)
        results.push({
          config_id: config.id,
          email_address: config.email_address,
          status: 'error',
          error: error.message
        })
      }
    }

    const totalReceived = results.reduce((sum, r) => sum + (r.received_count || 0), 0)
    const totalAutoSent = results.reduce((sum, r) => sum + (r.stats?.auto_sent || 0), 0)
    const totalDraftSaved = results.reduce((sum, r) => sum + (r.stats?.draft_saved || 0), 0)

    let message = '没有新邮件'
    if (totalReceived > 0) {
      message = `收取了 ${totalReceived} 封新邮件`
      if (totalAutoSent > 0 || totalDraftSaved > 0) {
        message += `，AI自动回复了 ${totalAutoSent} 封`
        if (totalDraftSaved > 0) {
          message += `，${totalDraftSaved} 封待人工审核`
        }
      }
    }

    return NextResponse.json({
      success: true,
      message,
      results,
      stats: {
        total_received: totalReceived,
        auto_sent: totalAutoSent,
        draft_saved: totalDraftSaved
      },
      summary: {
        total_configs: results.length,
        polled_at: now
      }
    })
  } catch (error: any) {
    console.error('执行轮询失败:', error)
    return NextResponse.json({
      success: false,
      error: error.message || '轮询执行失败'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: '邮箱轮询执行API',
    usage: 'POST /api/email-marketing/polling/execute',
    description: '执行自动收取邮件'
  })
}
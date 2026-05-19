import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../src/services/email-marketing/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const config_id = searchParams.get('config_id')

    const db = await getDB()
    
    let configs
    if (config_id) {
      configs = [db.prepare('SELECT * FROM email_config WHERE id = ?').get(config_id)]
    } else {
      configs = db.prepare('SELECT * FROM email_config WHERE is_active = 1').all()
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json({ error: '没有找到邮箱配置' }, { status: 404 })
    }

    const pollingStatus = configs.map((config: any) => ({
      config_id: config.id,
      email_address: config.email_address,
      poll_enabled: config.poll_enabled === 1,
      poll_interval: config.poll_interval || 0,
      last_poll_at: config.last_poll_at,
      auto_reply_enabled: config.auto_reply_enabled === 1
    }))

    return NextResponse.json({
      success: true,
      polling: pollingStatus.length === 1 ? pollingStatus[0] : pollingStatus
    })
  } catch (error: any) {
    console.error('获取轮询状态失败:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { config_id, poll_enabled, poll_interval } = await request.json()

    if (!config_id) {
      return NextResponse.json({ error: '缺少配置ID' }, { status: 400 })
    }

    if (poll_interval !== undefined && (poll_interval < 1 || poll_interval > 60)) {
      return NextResponse.json({ error: '轮询间隔需要在1-60分钟之间' }, { status: 400 })
    }

    const db = await getDB()
    
    const updates: string[] = []
    const params: any[] = []

    if (poll_enabled !== undefined) {
      updates.push('poll_enabled = ?')
      params.push(poll_enabled ? 1 : 0)
    }

    if (poll_interval !== undefined) {
      updates.push('poll_interval = ?')
      params.push(poll_interval)
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: '没有要更新的配置' }, { status: 400 })
    }

    updates.push('updated_at = datetime(\'now\', \'localtime\')')
    params.push(config_id)

    db.prepare(`UPDATE email_config SET ${updates.join(', ')} WHERE id = ?`).run(...params)

    const config = db.prepare('SELECT * FROM email_config WHERE id = ?').get(config_id)

    return NextResponse.json({
      success: true,
      message: poll_enabled ? `已启用自动收取，间隔 ${poll_interval} 分钟` : '已停止自动收取',
      polling: {
        config_id: (config as any).id,
        email_address: (config as any).email_address,
        poll_enabled: (config as any).poll_enabled === 1,
        poll_interval: (config as any).poll_interval,
        last_poll_at: (config as any).last_poll_at
      }
    })
  } catch (error: any) {
    console.error('更新轮询配置失败:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const config_id = searchParams.get('config_id')

    if (!config_id) {
      return NextResponse.json({ error: '缺少配置ID' }, { status: 400 })
    }

    const db = await getDB()
    db.prepare('UPDATE email_config SET poll_enabled = 0, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(config_id)

    return NextResponse.json({
      success: true,
      message: '已停止自动收取邮件'
    })
  } catch (error: any) {
    console.error('停止轮询失败:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

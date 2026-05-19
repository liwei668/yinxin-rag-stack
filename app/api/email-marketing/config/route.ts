import { NextRequest, NextResponse } from 'next/server'
import { getDB, addLog } from '../../../../src/services/email-marketing/database'

// GET - 获取邮箱配置列表
export async function GET(request: NextRequest) {
  try {
    const db = await getDB()
    const configs = db.prepare('SELECT * FROM email_config ORDER BY created_at DESC').all()

    // 不返回密码
    const safeConfigs = configs.map((c: any) => {
      const { password, ...safe } = c
      return safe
    })

    return NextResponse.json({ success: true, configs: safeConfigs })
  } catch (error) {
    console.error('获取邮箱配置失败', { error: String(error) })
    return NextResponse.json(
      { error: '获取邮箱配置失败' },
      { status: 500 }
    )
  }
}

// POST - 创建邮箱配置
export async function POST(request: NextRequest) {
  try {
    const {
      email_address,
      display_name,
      imap_host,
      imap_port = 993,
      smtp_host,
      smtp_port = 465,
      password,
      use_ssl = 1,
      auto_reply_enabled = 0,
      spam_filter_enabled = 0
    } = await request.json()

    if (!email_address || !imap_host || !smtp_host || !password) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      )
    }

    const db = await getDB()
    const id = `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    db.prepare(`
      INSERT INTO email_config 
      (id, email_address, display_name, imap_host, imap_port, smtp_host, smtp_port, password, use_ssl, auto_reply_enabled, spam_filter_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      email_address,
      display_name || email_address.split('@')[0],
      imap_host,
      imap_port,
      smtp_host,
      smtp_port,
      password,
      use_ssl ? 1 : 0,
      auto_reply_enabled ? 1 : 0,
      spam_filter_enabled ? 1 : 0
    )

    await addLog('SYSTEM', 'create', 'email_config', id, `创建邮箱配置: ${email_address}`)

    // 获取刚创建的配置（不包含密码）
    const newConfig = db.prepare('SELECT * FROM email_config WHERE id = ?').get(id)
    const { password: _, ...safeConfig } = newConfig

    return NextResponse.json({ success: true, config: safeConfig })
  } catch (error: any) {
    console.error('创建邮箱配置失败', { error: String(error) })
    if (error.message?.includes('UNIQUE')) {
      return NextResponse.json(
        { error: '该邮箱地址已存在' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: '创建邮箱配置失败' },
      { status: 500 }
    )
  }
}

// PUT - 更新邮箱配置
export async function PUT(request: NextRequest) {
  try {
    const {
      id,
      email_address,
      display_name,
      imap_host,
      imap_port,
      smtp_host,
      smtp_port,
      password,
      use_ssl,
      is_active,
      auto_reply_enabled,
      spam_filter_enabled
    } = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: '缺少配置ID' },
        { status: 400 }
      )
    }

    const db = await getDB()

    // 构建更新语句
    const updates: string[] = []
    const params: any[] = []

    if (email_address !== undefined) { updates.push('email_address = ?'); params.push(email_address); }
    if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name); }
    if (imap_host !== undefined) { updates.push('imap_host = ?'); params.push(imap_host); }
    if (imap_port !== undefined) { updates.push('imap_port = ?'); params.push(imap_port); }
    if (smtp_host !== undefined) { updates.push('smtp_host = ?'); params.push(smtp_host); }
    if (smtp_port !== undefined) { updates.push('smtp_port = ?'); params.push(smtp_port); }
    if (password !== undefined) { updates.push('password = ?'); params.push(password); }
    if (use_ssl !== undefined) { updates.push('use_ssl = ?'); params.push(use_ssl ? 1 : 0); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (auto_reply_enabled !== undefined) { updates.push('auto_reply_enabled = ?'); params.push(auto_reply_enabled ? 1 : 0); }
    if (spam_filter_enabled !== undefined) { updates.push('spam_filter_enabled = ?'); params.push(spam_filter_enabled ? 1 : 0); }

    if (updates.length > 0) {
      updates.push('updated_at = datetime(\'now\',\'localtime\')')
      params.push(id)

      db.prepare(`
        UPDATE email_config 
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...params)

      await addLog('SYSTEM', 'update', 'email_config', id, '更新邮箱配置')
    }

    // 获取更新后的配置
    const updatedConfig = db.prepare('SELECT * FROM email_config WHERE id = ?').get(id)
    const { password: _, ...safeConfig } = updatedConfig

    return NextResponse.json({ success: true, config: safeConfig })
  } catch (error: any) {
    console.error('更新邮箱配置失败', { error: String(error) })
    return NextResponse.json(
      { error: '更新邮箱配置失败' },
      { status: 500 }
    )
  }
}

// DELETE - 删除邮箱配置
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: '缺少配置ID' },
        { status: 400 }
      )
    }

    const db = await getDB()

    // 获取配置信息用于日志
    const config = db.prepare('SELECT email_address FROM email_config WHERE id = ?').get(id)
    if (!config) {
      return NextResponse.json(
        { error: '配置不存在' },
        { status: 404 }
      )
    }

    db.prepare('DELETE FROM email_config WHERE id = ?').run(id)

    await addLog('SYSTEM', 'delete', 'email_config', id, `删除邮箱配置: ${config.email_address}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除邮箱配置失败', { error: String(error) })
    return NextResponse.json(
      { error: '删除邮箱配置失败' },
      { status: 500 }
    )
  }
}

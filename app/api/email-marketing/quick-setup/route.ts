import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../src/services/email-marketing/database'

// GET - 查看并清理所有邮箱配置
export async function GET(request: NextRequest) {
  try {
    const db = await getDB()
    
    // 查询所有配置
    const allConfigs = db.prepare('SELECT * FROM email_config ORDER BY created_at DESC').all()
    
    return NextResponse.json({
      success: true,
      message: `数据库中有 ${allConfigs.length} 个邮箱配置`,
      configs: allConfigs.map((c: any) => ({
        id: c.id,
        email_address: c.email_address,
        imap_host: c.imap_host,
        smtp_host: c.smtp_host,
        is_active: c.is_active,
        created_at: c.created_at
      }))
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}

// DELETE - 删除所有配置或指定配置
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const clearAll = searchParams.get('clearAll')

    const db = await getDB()

    if (clearAll === 'yes') {
      const result = db.prepare('DELETE FROM email_config').run()
      return NextResponse.json({
        success: true,
        message: `已删除所有 ${result.changes} 个邮箱配置`
      })
    }

    if (id) {
      const config = db.prepare('SELECT email_address FROM email_config WHERE id = ?').get(id)
      if (!config) {
        return NextResponse.json({ error: '配置不存在' }, { status: 404 })
      }
      db.prepare('DELETE FROM email_config WHERE id = ?').run(id)
      return NextResponse.json({
        success: true,
        message: `已删除邮箱配置: ${config.email_address}`
      })
    }

    return NextResponse.json({ error: '缺少参数' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}

// POST - 添加QQ邮箱配置
export async function POST(request: NextRequest) {
  try {
    const { email_address, password } = await request.json()

    if (!email_address || !password) {
      return NextResponse.json({ error: '缺少邮箱地址或密码' }, { status: 400 })
    }

    const db = await getDB()
    
    // 检查是否已存在
    const existing = db.prepare('SELECT id FROM email_config WHERE email_address = ?').get(email_address)
    if (existing) {
      return NextResponse.json({ error: '该邮箱已存在' }, { status: 400 })
    }

    const id = `cfg_${Date.now()}`
    
    db.prepare(`
      INSERT INTO email_config 
      (id, email_address, display_name, imap_host, imap_port, smtp_host, smtp_port, password, use_ssl, is_active, auto_reply_enabled, spam_filter_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      email_address,
      email_address.split('@')[0],
      'imap.qq.com',
      993,
      'smtp.qq.com',
      465,
      password,
      1,
      1,
      0,
      1
    )

    const newConfig = db.prepare('SELECT * FROM email_config WHERE id = ?').get(id)
    const { password: _, ...safeConfig } = newConfig

    return NextResponse.json({ 
      success: true, 
      message: 'QQ邮箱配置成功！',
      config: safeConfig 
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

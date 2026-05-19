import { NextRequest, NextResponse } from 'next/server'
import { getDB, addLog } from '../../../../src/services/email-marketing/database'

// GET - 获取签名列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const config_id = searchParams.get('config_id')

    if (!config_id) {
      return NextResponse.json(
        { error: '缺少邮箱配置ID' },
        { status: 400 }
      )
    }

    const db = await getDB()
    const signatures = db.prepare(`
      SELECT * FROM email_signature 
      WHERE config_id = ?
      ORDER BY is_default DESC, created_at DESC
    `).all(config_id)

    return NextResponse.json({ success: true, signatures })
  } catch (error) {
    console.error('获取签名列表失败', { error: String(error) })
    return NextResponse.json(
      { error: '获取签名列表失败' },
      { status: 500 }
    )
  }
}

// POST - 创建签名
export async function POST(request: NextRequest) {
  try {
    const { config_id, name, content, is_default = false } = await request.json()

    if (!config_id || !name || !content) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      )
    }

    const db = await getDB()

    // 如果设置为默认，先取消其他默认
    if (is_default) {
      db.prepare('UPDATE email_signature SET is_default = 0 WHERE config_id = ?').run(config_id)
    }

    const id = `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    db.prepare(`
      INSERT INTO email_signature (id, config_id, name, content, is_default)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      config_id,
      name,
      content,
      is_default ? 1 : 0
    )

    await addLog('SYSTEM', 'create', 'email_signature', id, `创建签名: ${name}`)

    const newSignature = db.prepare('SELECT * FROM email_signature WHERE id = ?').get(id)

    return NextResponse.json({ success: true, signature: newSignature })
  } catch (error) {
    console.error('创建签名失败', { error: String(error) })
    return NextResponse.json(
      { error: '创建签名失败' },
      { status: 500 }
    )
  }
}

// PUT - 更新签名
export async function PUT(request: NextRequest) {
  try {
    const { id, name, content, is_default } = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: '缺少签名ID' },
        { status: 400 }
      )
    }

    const db = await getDB()

    // 获取当前签名
    const current = db.prepare('SELECT * FROM email_signature WHERE id = ?').get(id) as any
    if (!current) {
      return NextResponse.json(
        { error: '签名不存在' },
        { status: 404 }
      )
    }

    // 如果设置为默认，先取消其他默认
    if (is_default && !current.is_default) {
      db.prepare('UPDATE email_signature SET is_default = 0 WHERE config_id = ?').run(current.config_id)
    }

    const updates: string[] = []
    const params: any[] = []

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (content !== undefined) { updates.push('content = ?'); params.push(content); }
    if (is_default !== undefined) { updates.push('is_default = ?'); params.push(is_default ? 1 : 0); }

    if (updates.length > 0) {
      params.push(id)
      db.prepare(`
        UPDATE email_signature 
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...params)

      await addLog('SYSTEM', 'update', 'email_signature', id, '更新签名')
    }

    const updatedSignature = db.prepare('SELECT * FROM email_signature WHERE id = ?').get(id)

    return NextResponse.json({ success: true, signature: updatedSignature })
  } catch (error) {
    console.error('更新签名失败', { error: String(error) })
    return NextResponse.json(
      { error: '更新签名失败' },
      { status: 500 }
    )
  }
}

// DELETE - 删除签名
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: '缺少签名ID' },
        { status: 400 }
      )
    }

    const db = await getDB()

    const signature = db.prepare('SELECT name FROM email_signature WHERE id = ?').get(id)
    if (!signature) {
      return NextResponse.json(
        { error: '签名不存在' },
        { status: 404 }
      )
    }

    db.prepare('DELETE FROM email_signature WHERE id = ?').run(id)

    await addLog('SYSTEM', 'delete', 'email_signature', id, `删除签名: ${signature.name}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除签名失败', { error: String(error) })
    return NextResponse.json(
      { error: '删除签名失败' },
      { status: 500 }
    )
  }
}

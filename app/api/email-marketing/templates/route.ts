import { NextRequest, NextResponse } from 'next/server'
import { getDB, addLog } from '../../../../src/services/email-marketing/database'

// GET - 获取模板列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const active = searchParams.get('active')

    const db = await getDB()
    let query = 'SELECT * FROM email_template WHERE 1=1'
    const params: any[] = []

    if (category) {
      query += ' AND category = ?'
      params.push(category)
    }

    if (active !== null && active !== undefined) {
      query += ' AND is_active = ?'
      params.push(active === 'true' ? 1 : 0)
    }

    query += ' ORDER BY created_at DESC'

    const templates = db.prepare(query).all(...params)

    return NextResponse.json({ success: true, templates })
  } catch (error) {
    console.error('获取模板列表失败', { error: String(error) })
    return NextResponse.json(
      { error: '获取模板列表失败' },
      { status: 500 }
    )
  }
}

// POST - 创建模板
export async function POST(request: NextRequest) {
  try {
    const { name, subject, content, category = 'general', variables } = await request.json()

    if (!name || !subject || !content) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      )
    }

    const db = await getDB()
    const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    db.prepare(`
      INSERT INTO email_template (id, name, subject, content, category, variables)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      subject,
      content,
      category,
      variables ? JSON.stringify(variables) : null
    )

    await addLog('SYSTEM', 'create', 'email_template', id, `创建模板: ${name}`)

    const newTemplate = db.prepare('SELECT * FROM email_template WHERE id = ?').get(id)

    return NextResponse.json({ success: true, template: newTemplate })
  } catch (error: any) {
    console.error('创建模板失败', { error: String(error) })
    return NextResponse.json(
      { error: '创建模板失败' },
      { status: 500 }
    )
  }
}

// PUT - 更新模板
export async function PUT(request: NextRequest) {
  try {
    const { id, name, subject, content, category, variables, is_active } = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: '缺少模板ID' },
        { status: 400 }
      )
    }

    const db = await getDB()

    const updates: string[] = []
    const params: any[] = []

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (subject !== undefined) { updates.push('subject = ?'); params.push(subject); }
    if (content !== undefined) { updates.push('content = ?'); params.push(content); }
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }
    if (variables !== undefined) { updates.push('variables = ?'); params.push(variables ? JSON.stringify(variables) : null); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    if (updates.length > 0) {
      updates.push('updated_at = datetime(\'now\',\'localtime\')')
      params.push(id)

      db.prepare(`
        UPDATE email_template 
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...params)

      await addLog('SYSTEM', 'update', 'email_template', id, '更新模板')
    }

    const updatedTemplate = db.prepare('SELECT * FROM email_template WHERE id = ?').get(id)

    return NextResponse.json({ success: true, template: updatedTemplate })
  } catch (error) {
    console.error('更新模板失败', { error: String(error) })
    return NextResponse.json(
      { error: '更新模板失败' },
      { status: 500 }
    )
  }
}

// DELETE - 删除模板
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: '缺少模板ID' },
        { status: 400 }
      )
    }

    const db = await getDB()

    const template = db.prepare('SELECT name FROM email_template WHERE id = ?').get(id)
    if (!template) {
      return NextResponse.json(
        { error: '模板不存在' },
        { status: 404 }
      )
    }

    db.prepare('DELETE FROM email_template WHERE id = ?').run(id)

    await addLog('SYSTEM', 'delete', 'email_template', id, `删除模板: ${template.name}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除模板失败', { error: String(error) })
    return NextResponse.json(
      { error: '删除模板失败' },
      { status: 500 }
    )
  }
}

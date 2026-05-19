import { NextRequest, NextResponse } from 'next/server'
import { getDB, addLog } from '../../../../src/services/email-marketing/database'

// GET - 获取跟进提醒列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const contact_id = searchParams.get('contact_id')
    const is_completed = searchParams.get('is_completed')
    const upcoming = searchParams.get('upcoming')

    const db = await getDB()
    let whereClause = 'WHERE 1=1'
    const params: any[] = []

    if (contact_id) {
      whereClause += ' AND contact_id = ?'
      params.push(contact_id)
    }

    if (is_completed !== null && is_completed !== undefined) {
      whereClause += ' AND is_completed = ?'
      params.push(is_completed === 'true' ? 1 : 0)
    }

    if (upcoming === 'true') {
      whereClause += ' AND is_completed = 0 AND reminder_time > datetime(\'now\',\'localtime\')'
    }

    const reminders = db.prepare(`
      SELECT r.*, c.email_address as contact_email, c.name as contact_name
      FROM followup_reminder r
      LEFT JOIN contact c ON r.contact_id = c.id
      ${whereClause}
      ORDER BY reminder_time ASC
    `).all(...params)

    return NextResponse.json({ success: true, reminders })
  } catch (error) {
    console.error('获取跟进提醒失败', { error: String(error) })
    return NextResponse.json(
      { error: '获取跟进提醒失败' },
      { status: 500 }
    )
  }
}

// POST - 创建跟进提醒
export async function POST(request: NextRequest) {
  try {
    const { contact_id, title, description, reminder_time } = await request.json()

    if (!contact_id || !title || !reminder_time) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      )
    }

    const db = await getDB()
    const id = `reminder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    db.prepare(`
      INSERT INTO followup_reminder (id, contact_id, title, description, reminder_time)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      contact_id,
      title,
      description || null,
      reminder_time
    )

    await addLog('SYSTEM', 'create', 'followup_reminder', id, `创建跟进提醒: ${title}`)

    const newReminder = db.prepare('SELECT * FROM followup_reminder WHERE id = ?').get(id)

    return NextResponse.json({ success: true, reminder: newReminder })
  } catch (error) {
    console.error('创建跟进提醒失败', { error: String(error) })
    return NextResponse.json(
      { error: '创建跟进提醒失败' },
      { status: 500 }
    )
  }
}

// PUT - 更新跟进提醒
export async function PUT(request: NextRequest) {
  try {
    const { id, title, description, reminder_time, is_completed } = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: '缺少提醒ID' },
        { status: 400 }
      )
    }

    const db = await getDB()

    const updates: string[] = []
    const params: any[] = []

    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (reminder_time !== undefined) { updates.push('reminder_time = ?'); params.push(reminder_time); }
    if (is_completed !== undefined) {
      updates.push('is_completed = ?')
      params.push(is_completed ? 1 : 0)
      if (is_completed) {
        updates.push('completed_at = datetime(\'now\',\'localtime\')')
      }
    }

    if (updates.length > 0) {
      params.push(id)
      db.prepare(`
        UPDATE followup_reminder 
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...params)

      await addLog('SYSTEM', 'update', 'followup_reminder', id, '更新跟进提醒')
    }

    const updatedReminder = db.prepare('SELECT * FROM followup_reminder WHERE id = ?').get(id)

    return NextResponse.json({ success: true, reminder: updatedReminder })
  } catch (error) {
    console.error('更新跟进提醒失败', { error: String(error) })
    return NextResponse.json(
      { error: '更新跟进提醒失败' },
      { status: 500 }
    )
  }
}

// DELETE - 删除跟进提醒
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: '缺少提醒ID' },
        { status: 400 }
      )
    }

    const db = await getDB()

    const reminder = db.prepare('SELECT title FROM followup_reminder WHERE id = ?').get(id)
    if (!reminder) {
      return NextResponse.json(
        { error: '提醒不存在' },
        { status: 404 }
      )
    }

    db.prepare('DELETE FROM followup_reminder WHERE id = ?').run(id)

    await addLog('SYSTEM', 'delete', 'followup_reminder', id, `删除跟进提醒: ${reminder.title}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除跟进提醒失败', { error: String(error) })
    return NextResponse.json(
      { error: '删除跟进提醒失败' },
      { status: 500 }
    )
  }
}

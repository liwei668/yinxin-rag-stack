import { NextRequest, NextResponse } from 'next/server'
import { getDB, addLog } from '../../../../src/services/email-marketing/database'

// GET - 获取联系人列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const is_lead = searchParams.get('is_lead')
    const lead_status = searchParams.get('lead_status')
    const search = searchParams.get('search')

    const db = await getDB()
    let whereClause = 'WHERE 1=1'
    const params: any[] = []

    if (is_lead !== null && is_lead !== undefined) {
      whereClause += ' AND is_lead = ?'
      params.push(is_lead === 'true' ? 1 : 0)
    }

    if (lead_status) {
      whereClause += ' AND lead_status = ?'
      params.push(lead_status)
    }

    if (search) {
      whereClause += ' AND (email_address LIKE ? OR name LIKE ? OR company LIKE ?)'
      const searchPattern = `%${search}%`
      params.push(searchPattern, searchPattern, searchPattern)
    }

    // 获取总数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM contact ${whereClause}
    `).get(...params) as { total: number }

    // 获取联系人列表
    const offset = (page - 1) * pageSize
    const contacts = db.prepare(`
      SELECT * FROM contact 
      ${whereClause}
      ORDER BY last_contact_at DESC, created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset)

    return NextResponse.json({
      success: true,
      contacts,
      pagination: {
        page,
        pageSize,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / pageSize)
      }
    })
  } catch (error) {
    console.error('获取联系人列表失败', { error: String(error) })
    return NextResponse.json(
      { error: '获取联系人列表失败' },
      { status: 500 }
    )
  }
}

// POST - 创建联系人
export async function POST(request: NextRequest) {
  try {
    const { email_address, name, company, phone, tags, notes, is_lead = false } = await request.json()

    if (!email_address) {
      return NextResponse.json(
        { error: '缺少邮箱地址' },
        { status: 400 }
      )
    }

    const db = await getDB()
    const id = `contact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    db.prepare(`
      INSERT INTO contact (id, email_address, name, company, phone, tags, notes, is_lead)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      email_address,
      name || null,
      company || null,
      phone || null,
      tags || null,
      notes || null,
      is_lead ? 1 : 0
    )

    await addLog('SYSTEM', 'create', 'contact', id, `创建联系人: ${email_address}`)

    const newContact = db.prepare('SELECT * FROM contact WHERE id = ?').get(id)

    return NextResponse.json({ success: true, contact: newContact })
  } catch (error: any) {
    console.error('创建联系人失败', { error: String(error) })
    if (error.message?.includes('UNIQUE')) {
      return NextResponse.json(
        { error: '该邮箱地址已存在' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: '创建联系人失败' },
      { status: 500 }
    )
  }
}

// PUT - 更新联系人
export async function PUT(request: NextRequest) {
  try {
    const { id, name, company, phone, tags, notes, is_lead, lead_score, lead_status } = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: '缺少联系人ID' },
        { status: 400 }
      )
    }

    const db = await getDB()

    const updates: string[] = []
    const params: any[] = []

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (company !== undefined) { updates.push('company = ?'); params.push(company); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(tags); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (is_lead !== undefined) { updates.push('is_lead = ?'); params.push(is_lead ? 1 : 0); }
    if (lead_score !== undefined) { updates.push('lead_score = ?'); params.push(lead_score); }
    if (lead_status !== undefined) { updates.push('lead_status = ?'); params.push(lead_status); }

    if (updates.length > 0) {
      updates.push('updated_at = datetime(\'now\',\'localtime\')')
      params.push(id)

      db.prepare(`
        UPDATE contact 
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...params)

      await addLog('SYSTEM', 'update', 'contact', id, '更新联系人')
    }

    const updatedContact = db.prepare('SELECT * FROM contact WHERE id = ?').get(id)

    return NextResponse.json({ success: true, contact: updatedContact })
  } catch (error) {
    console.error('更新联系人失败', { error: String(error) })
    return NextResponse.json(
      { error: '更新联系人失败' },
      { status: 500 }
    )
  }
}

// DELETE - 删除联系人
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: '缺少联系人ID' },
        { status: 400 }
      )
    }

    const db = await getDB()

    const contact = db.prepare('SELECT email_address FROM contact WHERE id = ?').get(id)
    if (!contact) {
      return NextResponse.json(
        { error: '联系人不存在' },
        { status: 404 }
      )
    }

    db.prepare('DELETE FROM contact WHERE id = ?').run(id)

    await addLog('SYSTEM', 'delete', 'contact', id, `删除联系人: ${contact.email_address}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除联系人失败', { error: String(error) })
    return NextResponse.json(
      { error: '删除联系人失败' },
      { status: 500 }
    )
  }
}

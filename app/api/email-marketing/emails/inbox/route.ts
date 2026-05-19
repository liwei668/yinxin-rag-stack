import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../../src/services/email-marketing/database'

// GET - 获取收件箱邮件列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const config_id = searchParams.get('config_id')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const is_read = searchParams.get('is_read')
    const is_spam = searchParams.get('is_spam')
    const search = searchParams.get('search')

    if (!config_id) {
      return NextResponse.json(
        { error: '缺少邮箱配置ID' },
        { status: 400 }
      )
    }

    const db = await getDB()
    let whereClause = 'WHERE config_id = ?'
    const params: any[] = [config_id]

    if (is_read !== null && is_read !== undefined) {
      whereClause += ' AND is_read = ?'
      params.push(is_read === 'true' ? 1 : 0)
    }

    if (is_spam !== null && is_spam !== undefined) {
      whereClause += ' AND is_spam = ?'
      params.push(is_spam === 'true' ? 1 : 0)
    }

    if (search) {
      whereClause += ' AND (subject LIKE ? OR from_address LIKE ? OR content LIKE ?)'
      const searchPattern = `%${search}%`
      params.push(searchPattern, searchPattern, searchPattern)
    }

    // 获取总数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM received_email ${whereClause}
    `).get(...params) as { total: number }

    // 获取邮件列表
    const offset = (page - 1) * pageSize
    const emails = db.prepare(`
      SELECT id, message_id, from_address, from_name, to_address, subject, 
             content, is_read, is_spam, spam_reason, has_attachment, received_at,
             substr(content, 1, 100) as content_preview
      FROM received_email 
      ${whereClause}
      ORDER BY received_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset)

    return NextResponse.json({
      success: true,
      emails,
      pagination: {
        page,
        pageSize,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / pageSize)
      }
    })
  } catch (error) {
    console.error('获取收件箱失败', { error: String(error) })
    return NextResponse.json(
      { error: '获取收件箱失败' },
      { status: 500 }
    )
  }
}

// PUT - 标记邮件已读
export async function PUT(request: NextRequest) {
  try {
    const { id, is_read } = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: '缺少邮件ID' },
        { status: 400 }
      )
    }

    const db = await getDB()
    db.prepare('UPDATE received_email SET is_read = ? WHERE id = ?').run(is_read ? 1 : 0, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('标记邮件已读失败', { error: String(error) })
    return NextResponse.json(
      { error: '标记邮件已读失败' },
      { status: 500 }
    )
  }
}

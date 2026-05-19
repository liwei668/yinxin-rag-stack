import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../src/services/email-marketing/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const db = await getDB()

    const totalResult = db.prepare(`
      SELECT COUNT(*) as total FROM sent_email WHERE status IN ('draft', 'pending')
    `).get() as { total: number }

    const offset = (page - 1) * pageSize
    const emails = db.prepare(`
      SELECT 
        id, config_id, to_address, to_name, subject, content, status, intent, confidence,
        original_email_id, error_message, created_at, sent_at
      FROM sent_email 
      WHERE status IN ('draft', 'pending')
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(pageSize, offset)

    // 加载原始邮件信息
    const emailsWithOriginal = emails.map((email: any) => {
      if (email.original_email_id) {
        try {
          const originalEmail = db.prepare(`
            SELECT from_address, from_name, subject, content 
            FROM received_email 
            WHERE id = ?
          `).get(email.original_email_id)
          
          if (originalEmail) {
            email.original_email = originalEmail
          }
        } catch (e) {
          console.error('加载原始邮件失败:', e)
        }
      }
      return email
    })

    return NextResponse.json({
      success: true,
      emails: emailsWithOriginal,
      pagination: {
        page,
        pageSize,
        total: totalResult.total,
        totalPages: Math.ceil(totalResult.total / pageSize)
      }
    })
  } catch (error: any) {
    console.error('获取草稿邮件失败:', error)
    return NextResponse.json(
      { error: error.message || '获取草稿邮件失败' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '缺少邮件ID' }, { status: 400 })
    }

    const db = await getDB()
    db.prepare('DELETE FROM sent_email WHERE id = ? AND status IN (\'draft\', \'pending\')').run(id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('删除草稿失败:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

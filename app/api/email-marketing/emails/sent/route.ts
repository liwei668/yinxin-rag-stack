import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../../src/services/email-marketing/database'

// GET - 获取已发送邮件列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const config_id = searchParams.get('config_id')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const status = searchParams.get('status')
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

    if (status) {
      whereClause += ' AND status = ?'
      params.push(status)
    }

    if (search) {
      whereClause += ' AND (subject LIKE ? OR to_address LIKE ? OR content LIKE ?)'
      const searchPattern = `%${search}%`
      params.push(searchPattern, searchPattern, searchPattern)
    }

    // 获取总数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM sent_email ${whereClause}
    `).get(...params) as { total: number }

    // 获取邮件列表
    const offset = (page - 1) * pageSize
    const emails = db.prepare(`
      SELECT id, to_address, to_name, cc_address, subject, content, 
             status, error_message, sent_at, created_at,
             substr(content, 1, 100) as content_preview
      FROM sent_email 
      ${whereClause}
      ORDER BY created_at DESC
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
    console.error('获取已发送邮件失败', { error: String(error) })
    return NextResponse.json(
      { error: '获取已发送邮件失败' },
      { status: 500 }
    )
  }
}

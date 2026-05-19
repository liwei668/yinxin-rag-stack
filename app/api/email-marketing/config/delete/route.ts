import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../../src/services/email-marketing/database'

// GET - 删除配置（简单版）
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

    const config = db.prepare('SELECT email_address FROM email_config WHERE id = ?').get(id)
    if (!config) {
      return NextResponse.json(
        { error: '配置不存在' },
        { status: 404 }
      )
    }

    db.prepare('DELETE FROM email_config WHERE id = ?').run(id)

    return NextResponse.json({ 
      success: true, 
      message: `已删除邮箱配置: ${config.email_address}` 
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}

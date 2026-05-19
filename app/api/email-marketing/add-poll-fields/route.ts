import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../src/services/email-marketing/database'

export async function POST() {
  try {
    const db = await getDB()
    
    const migrations = [
      { name: 'add_poll_interval', sql: `ALTER TABLE email_config ADD COLUMN poll_interval INTEGER DEFAULT 0` },
      { name: 'add_poll_enabled', sql: `ALTER TABLE email_config ADD COLUMN poll_enabled INTEGER DEFAULT 0` },
      { name: 'add_last_poll_at', sql: `ALTER TABLE email_config ADD COLUMN last_poll_at TEXT` }
    ]

    const results: string[] = []
    
    for (const migration of migrations) {
      try {
        db.exec(migration.sql)
        results.push(`✓ ${migration.name}`)
      } catch (e: any) {
        if (e.message.includes('duplicate column') || e.message.includes('can only add')) {
          results.push(`⏭ ${migration.name} - 已存在`)
        } else {
          results.push(`✗ ${migration.name}: ${e.message}`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: '轮询字段添加完成',
      results
    })
  } catch (error: any) {
    console.error('数据库更新失败:', error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

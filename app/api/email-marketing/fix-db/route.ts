import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../src/services/email-marketing/database'

export async function POST() {
  try {
    const db = await getDB()
    
    const migrations = [
      { name: 'add_ai_fields_to_sent_email', sql: `
        ALTER TABLE sent_email ADD COLUMN intent TEXT;
        ALTER TABLE sent_email ADD COLUMN confidence REAL DEFAULT 0;
        ALTER TABLE sent_email ADD COLUMN original_email_id TEXT;
      `},
      { name: 'add_ai_fields_to_received_email', sql: `
        ALTER TABLE received_email ADD COLUMN intent TEXT;
        ALTER TABLE received_email ADD COLUMN ai_replied INTEGER DEFAULT 0;
      `}
    ]

    const results: string[] = []
    
    for (const migration of migrations) {
      try {
        db.exec(migration.sql)
        results.push(`✓ ${migration.name}`)
      } catch (e: any) {
        if (e.message.includes('duplicate column')) {
          results.push(`⏭ ${migration.name} - 已存在`)
        } else {
          results.push(`✗ ${migration.name}: ${e.message}`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: '数据库更新完成',
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

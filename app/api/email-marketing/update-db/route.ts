import { NextResponse } from 'next/server'
import { getDB } from '../../../../src/services/email-marketing/database'

// POST - 更新数据库schema
export async function POST() {
  try {
    const db = await getDB()
    const changes: string[] = []

    // 更新 received_email 表
    try {
      db.prepare('ALTER TABLE received_email ADD COLUMN ai_replied INTEGER NOT NULL DEFAULT 0').run()
      changes.push('添加字段: received_email.ai_replied')
    } catch (e: any) {
      if (!e.message?.includes('duplicate column name')) {
        console.log(e.message)
      }
    }

    try {
      db.prepare('ALTER TABLE received_email ADD COLUMN intent TEXT').run()
      changes.push('添加字段: received_email.intent')
    } catch (e: any) {
      if (!e.message?.includes('duplicate column name')) {
        console.log(e.message)
      }
    }

    // 更新 sent_email 表
    try {
      db.prepare('ALTER TABLE sent_email ADD COLUMN intent TEXT').run()
      changes.push('添加字段: sent_email.intent')
    } catch (e: any) {
      if (!e.message?.includes('duplicate column name')) {
        console.log(e.message)
      }
    }

    try {
      db.prepare('ALTER TABLE sent_email ADD COLUMN confidence REAL').run()
      changes.push('添加字段: sent_email.confidence')
    } catch (e: any) {
      if (!e.message?.includes('duplicate column name')) {
        console.log(e.message)
      }
    }

    try {
      db.prepare('ALTER TABLE sent_email ADD COLUMN original_email_id TEXT').run()
      changes.push('添加字段: sent_email.original_email_id')
    } catch (e: any) {
      if (!e.message?.includes('duplicate column name')) {
        console.log(e.message)
      }
    }

    // 更新 email_config 表
    try {
      db.prepare('ALTER TABLE email_config ADD COLUMN poll_enabled INTEGER NOT NULL DEFAULT 0').run()
      changes.push('添加字段: email_config.poll_enabled')
    } catch (e: any) {
      if (!e.message?.includes('duplicate column name')) {
        console.log(e.message)
      }
    }

    try {
      db.prepare('ALTER TABLE email_config ADD COLUMN poll_interval INTEGER NOT NULL DEFAULT 5').run()
      changes.push('添加字段: email_config.poll_interval')
    } catch (e: any) {
      if (!e.message?.includes('duplicate column name')) {
        console.log(e.message)
      }
    }

    try {
      db.prepare('ALTER TABLE email_config ADD COLUMN last_poll_at TEXT').run()
      changes.push('添加字段: email_config.last_poll_at')
    } catch (e: any) {
      if (!e.message?.includes('duplicate column name')) {
        console.log(e.message)
      }
    }

    return NextResponse.json({
      success: true,
      changes,
      message: changes.length > 0 ? '数据库更新成功' : '数据库已是最新版本'
    })
  } catch (error: any) {
    console.error('更新数据库失败:', error)
    return NextResponse.json(
      { error: error.message || '更新数据库失败' },
      { status: 500 }
    )
  }
}

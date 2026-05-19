import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../src/services/email-marketing/database'

export async function GET() {
  try {
    const db = await getDB()
    
    const missingTables: string[] = []
    const createdTables: string[] = []
    
    const tablesToCreate = [
      {
        name: 'email_config',
        sql: `
          CREATE TABLE IF NOT EXISTS email_config (
            id TEXT PRIMARY KEY,
            email_address TEXT NOT NULL UNIQUE,
            display_name TEXT,
            imap_host TEXT NOT NULL,
            imap_port INTEGER NOT NULL DEFAULT 993,
            smtp_host TEXT NOT NULL,
            smtp_port INTEGER NOT NULL DEFAULT 465,
            password TEXT NOT NULL,
            use_ssl INTEGER NOT NULL DEFAULT 1,
            is_active INTEGER NOT NULL DEFAULT 1,
            auto_reply_enabled INTEGER NOT NULL DEFAULT 0,
            spam_filter_enabled INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
          )
        `
      },
      {
        name: 'email_template',
        sql: `
          CREATE TABLE IF NOT EXISTS email_template (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            subject TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            variables TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
          )
        `
      },
      {
        name: 'received_email',
        sql: `
          CREATE TABLE IF NOT EXISTS received_email (
            id TEXT PRIMARY KEY,
            config_id TEXT NOT NULL,
            message_id TEXT,
            from_address TEXT NOT NULL,
            from_name TEXT,
            to_address TEXT NOT NULL,
            subject TEXT,
            content TEXT,
            html_content TEXT,
            is_read INTEGER NOT NULL DEFAULT 0,
            is_spam INTEGER NOT NULL DEFAULT 0,
            spam_reason TEXT,
            has_attachment INTEGER NOT NULL DEFAULT 0,
            thread_id TEXT,
            in_reply_to TEXT,
            references TEXT,
            received_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (config_id) REFERENCES email_config(id) ON DELETE CASCADE
          )
        `
      },
      {
        name: 'sent_email',
        sql: `
          CREATE TABLE IF NOT EXISTS sent_email (
            id TEXT PRIMARY KEY,
            config_id TEXT NOT NULL,
            message_id TEXT,
            to_address TEXT NOT NULL,
            to_name TEXT,
            cc_address TEXT,
            bcc_address TEXT,
            subject TEXT NOT NULL,
            content TEXT NOT NULL,
            html_content TEXT,
            template_id TEXT,
            signature_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            sent_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (config_id) REFERENCES email_config(id) ON DELETE CASCADE,
            FOREIGN KEY (template_id) REFERENCES email_template(id) ON DELETE SET NULL
          )
        `
      },
      {
        name: 'contact',
        sql: `
          CREATE TABLE IF NOT EXISTS contact (
            id TEXT PRIMARY KEY,
            email_address TEXT NOT NULL UNIQUE,
            name TEXT,
            company TEXT,
            phone TEXT,
            tags TEXT,
            notes TEXT,
            is_lead INTEGER NOT NULL DEFAULT 0,
            lead_score INTEGER NOT NULL DEFAULT 0,
            lead_status TEXT NOT NULL DEFAULT 'new',
            source TEXT,
            last_contact_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
          )
        `
      },
      {
        name: 'followup_reminder',
        sql: `
          CREATE TABLE IF NOT EXISTS followup_reminder (
            id TEXT PRIMARY KEY,
            contact_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            reminder_time TEXT NOT NULL,
            is_completed INTEGER NOT NULL DEFAULT 0,
            completed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (contact_id) REFERENCES contact(id) ON DELETE CASCADE
          )
        `
      },
      {
        name: 'email_signature',
        sql: `
          CREATE TABLE IF NOT EXISTS email_signature (
            id TEXT PRIMARY KEY,
            config_id TEXT NOT NULL,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (config_id) REFERENCES email_config(id) ON DELETE CASCADE
          )
        `
      },
      {
        name: 'operation_log',
        sql: `
          CREATE TABLE IF NOT EXISTS operation_log (
            id TEXT PRIMARY KEY,
            operator TEXT NOT NULL DEFAULT '',
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            detail TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
          )
        `
      }
    ]

    for (const table of tablesToCreate) {
      try {
        const exists = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name=?
        `).get(table.name)
        
        if (!exists) {
          db.exec(table.sql)
          createdTables.push(table.name)
        }
      } catch (err) {
        missingTables.push(table.name)
      }
    }

    return NextResponse.json({
      success: true,
      message: '数据库修复完成',
      created_tables: createdTables,
      missing_tables: missingTables
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}

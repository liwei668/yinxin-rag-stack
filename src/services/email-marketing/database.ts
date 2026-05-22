// 邮箱营销模块数据库管理
import path from 'path';
import fs from 'fs';

// 动态导入 better-sqlite3（使用 new Function 彻底绕过 Turbopack 静态分析）
// eslint-disable-next-line no-new-func
const _importModule = new Function('mod', 'return import(mod)');
let DatabaseCtor: any = null;
let initPromise: Promise<any> | null = null;

async function ensureDB() {
  if (DatabaseCtor) return;
  const m = await _importModule('better-sqlite3');
  DatabaseCtor = m.default;
}

const DB_DIR = path.join(process.cwd(), 'data', 'email-marketing');
const DB_PATH = path.join(DB_DIR, 'email-marketing.db');

let db: any = null;

export async function getDB(): Promise<any> {
  if (db) return db;

  // 如果已有初始化进行中，等待它完成
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await ensureDB();

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    try {
      db = new DatabaseCtor(DB_PATH);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');

      initTables(db);
      return db;
    } catch (error) {
      console.error('[EmailMarketing DB] 数据库初始化失败:', error);
      initPromise = null; // 允许重试
      throw error;
    }
  })();

  return initPromise;
}

function initTables(d: any) {
  // 邮箱配置表
  d.exec(`
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
  `);

  // 邮件签名表
  d.exec(`
    CREATE TABLE IF NOT EXISTS email_signature (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (config_id) REFERENCES email_config(id) ON DELETE CASCADE
    )
  `);

  // 邮件模板表
  d.exec(`
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
  `);

  // 收件箱邮件表
  d.exec(`
    CREATE TABLE IF NOT EXISTS received_email (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
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
      ref_headers TEXT,
      received_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (config_id) REFERENCES email_config(id) ON DELETE CASCADE
    )
  `);

  // 已发送邮件表
  d.exec(`
    CREATE TABLE IF NOT EXISTS sent_email (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
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
      FOREIGN KEY (template_id) REFERENCES email_template(id),
      FOREIGN KEY (signature_id) REFERENCES email_signature(id)
    )
  `);

  // 附件表
  d.exec(`
    CREATE TABLE IF NOT EXISTS email_attachment (
      id TEXT PRIMARY KEY,
      email_id TEXT NOT NULL,
      email_type TEXT NOT NULL DEFAULT 'received',
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 客户/联系人表
  d.exec(`
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
  `);

  // 跟进提醒表
  d.exec(`
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
  `);

  // 拓客任务表
  d.exec(`
    CREATE TABLE IF NOT EXISTS outreach_task (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      template_id TEXT NOT NULL,
      contact_ids TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      total_count INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (template_id) REFERENCES email_template(id)
    )
  `);

  // 垃圾邮件关键词表
  d.exec(`
    CREATE TABLE IF NOT EXISTS spam_keyword (
      id TEXT PRIMARY KEY,
      keyword TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'general',
      score INTEGER NOT NULL DEFAULT 10,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 安全发件人/白名单表
  d.exec(`
    CREATE TABLE IF NOT EXISTS safe_sender (
      id TEXT PRIMARY KEY,
      email_address TEXT NOT NULL UNIQUE,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 操作日志表
  d.exec(`
    CREATE TABLE IF NOT EXISTS operation_log (
      id TEXT PRIMARY KEY,
      operator TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 创建索引
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_received_config ON received_email(config_id);
    CREATE INDEX IF NOT EXISTS idx_received_from ON received_email(from_address);
    CREATE INDEX IF NOT EXISTS idx_received_spam ON received_email(is_spam);
    CREATE INDEX IF NOT EXISTS idx_received_date ON received_email(received_at);
    CREATE INDEX IF NOT EXISTS idx_sent_config ON sent_email(config_id);
    CREATE INDEX IF NOT EXISTS idx_sent_to ON sent_email(to_address);
    CREATE INDEX IF NOT EXISTS idx_sent_status ON sent_email(status);
    CREATE INDEX IF NOT EXISTS idx_sent_date ON sent_email(sent_at);
    CREATE INDEX IF NOT EXISTS idx_attachment_email ON email_attachment(email_id, email_type);
    CREATE INDEX IF NOT EXISTS idx_contact_email ON contact(email_address);
    CREATE INDEX IF NOT EXISTS idx_contact_lead ON contact(is_lead, lead_status);
    CREATE INDEX IF NOT EXISTS idx_reminder_contact ON followup_reminder(contact_id);
    CREATE INDEX IF NOT EXISTS idx_reminder_time ON followup_reminder(reminder_time);
    CREATE INDEX IF NOT EXISTS idx_task_status ON outreach_task(status);
    CREATE INDEX IF NOT EXISTS idx_spam_keyword ON spam_keyword(keyword);
    CREATE INDEX IF NOT EXISTS idx_safe_sender ON safe_sender(email_address);
    CREATE INDEX IF NOT EXISTS idx_log_created ON operation_log(created_at);
  `);

  // 初始化默认垃圾邮件关键词
  initDefaultSpamKeywords(d);
}

function initDefaultSpamKeywords(d: any) {
  const count = d.prepare('SELECT COUNT(*) as c FROM spam_keyword').get() as { c: number };
  if (count.c > 0) return;

  const defaultKeywords = [
    { keyword: '代开发票', category: 'finance', score: 100 },
    { keyword: '发票代开', category: 'finance', score: 100 },
    { keyword: '增值税发票', category: 'finance', score: 50 },
    { keyword: '普通发票', category: 'finance', score: 50 },
    { keyword: '专票', category: 'finance', score: 30 },
    { keyword: '开票', category: 'finance', score: 30 },
    { keyword: '返点', category: 'finance', score: 40 },
    { keyword: '回扣', category: 'finance', score: 50 },
    { keyword: '兼职', category: 'job', score: 30 },
    { keyword: '日结', category: 'job', score: 40 },
    { keyword: '刷单', category: 'job', score: 80 },
    { keyword: '信誉', category: 'job', score: 30 },
    { keyword: '贷款', category: 'finance', score: 40 },
    { keyword: '借钱', category: 'finance', score: 30 },
    { keyword: '无息贷款', category: 'finance', score: 60 },
    { keyword: '低息贷款', category: 'finance', score: 50 },
    { keyword: '信用卡', category: 'finance', score: 30 },
    { keyword: '提额', category: 'finance', score: 40 },
    { keyword: '中奖', category: 'scam', score: 80 },
    { keyword: '恭喜', category: 'scam', score: 20 },
    { keyword: '免费', category: 'promotion', score: 20 },
    { keyword: '限时', category: 'promotion', score: 15 },
    { keyword: '优惠', category: 'promotion', score: 15 },
    { keyword: '折扣', category: 'promotion', score: 15 },
    { keyword: '秒杀', category: 'promotion', score: 25 },
    { keyword: '抢购', category: 'promotion', score: 20 },
    { keyword: '点击这里', category: 'phishing', score: 40 },
    { keyword: '立即点击', category: 'phishing', score: 50 },
    { keyword: '确认账户', category: 'phishing', score: 60 },
    { keyword: '验证身份', category: 'phishing', score: 60 },
    { keyword: '账户异常', category: 'phishing', score: 70 },
    { keyword: '密码重置', category: 'phishing', score: 50 },
  ];

  const insert = d.prepare(
    'INSERT OR IGNORE INTO spam_keyword (id, keyword, category, score, is_active) VALUES (?, ?, ?, ?, 1)'
  );

  const transaction = d.transaction(() => {
    for (const kw of defaultKeywords) {
      insert.run(
        `kw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        kw.keyword,
        kw.category,
        kw.score
      );
    }
  });

  transaction();
  console.log(`已初始化 ${defaultKeywords.length} 个默认垃圾邮件关键词`);
}

// 关闭数据库连接
export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

// 备份数据库
export async function backupDB(): Promise<string> {
  const backupPath = path.join(DB_DIR, `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  const sourceDB = await getDB();
  sourceDB.backup(backupPath);
  return backupPath;
}

// 添加操作日志
export async function addLog(operator: string, action: string, targetType: string, targetId: string, detail?: string) {
  const d = await getDB();
  d.prepare(
    'INSERT INTO operation_log (id, operator, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    operator, action, targetType, targetId, detail || null
  );
}

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'prompts.db');

let db: Database.Database | null = null;

function getDB(): Database.Database {
  if (!db) {
    try {
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      console.log('[Prompts DB] 数据库连接成功');
    } catch (error) {
      console.error('[Prompts DB] 数据库连接失败:', error);
      throw error;
    }
  }
  return db;
}

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  variables: string; // JSON array
  categories: string; // JSON array
  associatedKnowledgeDocs: string; // JSON array
  isActive: number;
  isDefault: number;
  type: string;
  scenario: string; // JSON array - 场景标签
  useCount?: number;
  successCount?: number;
  failCount?: number;
  successRate?: number | null;
  lastUsedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface PromptTemplateLog {
  id: string;
  templateId: string;
  userId: string | null;
  sessionId: string | null;
  callStatus: number;
  errorType: string | null;
  errorMsg: string | null;
  variables: string | null; // JSON
  responseTime: number | null;
  createdAt: string;
}

interface PromptTemplateVersion {
  id: string;
  templateId: string;
  content: string;
  version: string;
  createdAt: string;
}

class PromptDatabase {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.initTables();
    this.migrateAddScenarioColumn();
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        variables TEXT,
        categories TEXT,
        associated_knowledge_docs TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_default INTEGER NOT NULL DEFAULT 0,
        type TEXT DEFAULT 'general',
        scenario TEXT DEFAULT '[]',
        use_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        fail_count INTEGER NOT NULL DEFAULT 0,
        success_rate REAL,
        last_used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE INDEX IF NOT EXISTS idx_prompt_status ON prompt_templates(is_active);
      CREATE INDEX IF NOT EXISTS idx_prompt_default ON prompt_templates(is_default);
      CREATE INDEX IF NOT EXISTS idx_prompt_type ON prompt_templates(type);

      CREATE TABLE IF NOT EXISTS prompt_template_logs (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        user_id TEXT,
        session_id TEXT,
        call_status INTEGER NOT NULL,
        error_type TEXT,
        error_msg TEXT,
        variables TEXT,
        response_time INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE INDEX IF NOT EXISTS idx_log_template ON prompt_template_logs(template_id);
      CREATE INDEX IF NOT EXISTS idx_log_status ON prompt_template_logs(call_status);
      CREATE INDEX IF NOT EXISTS idx_log_created ON prompt_template_logs(created_at);

      CREATE TABLE IF NOT EXISTS prompt_template_versions (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        content TEXT NOT NULL,
        version TEXT DEFAULT '1.0',
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE INDEX IF NOT EXISTS idx_version_template ON prompt_template_versions(template_id);
    `);
  }

  // 迁移：添加 scenario 列（如果不存在）
  private migrateAddScenarioColumn() {
    try {
      const tableInfo = this.db.prepare('PRAGMA table_info(prompt_templates)').all() as any[];
      const hasScenario = tableInfo.some(col => col.name === 'scenario');
      if (!hasScenario) {
        this.db.exec('ALTER TABLE prompt_templates ADD COLUMN scenario TEXT DEFAULT \'[]\'');
        console.log('[PromptDB] 已添加 scenario 列');
      }
    } catch (error) {
      console.error('[PromptDB] 迁移失败:', error);
    }
  }

  // Prompt Templates
  getAllTemplates(): PromptTemplate[] {
    const stmt = this.db.prepare('SELECT * FROM prompt_templates ORDER BY created_at DESC');
    return stmt.all() as PromptTemplate[];
  }

  getActiveTemplates(): PromptTemplate[] {
    const stmt = this.db.prepare('SELECT * FROM prompt_templates WHERE is_active = 1 ORDER BY is_default DESC, created_at DESC');
    return stmt.all() as PromptTemplate[];
  }

  getTemplateById(id: string): PromptTemplate | undefined {
    const stmt = this.db.prepare('SELECT * FROM prompt_templates WHERE id = ?');
    return stmt.get(id) as PromptTemplate | undefined;
  }

  getDefaultTemplate(): PromptTemplate | undefined {
    const stmt = this.db.prepare('SELECT * FROM prompt_templates WHERE is_default = 1 AND is_active = 1 LIMIT 1');
    return stmt.get() as PromptTemplate | undefined;
  }

  createTemplate(template: Omit<PromptTemplate, 'createdAt' | 'updatedAt'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO prompt_templates (
        id, name, description, content, variables, categories,
        associated_knowledge_docs, is_active, is_default, type, scenario,
        use_count, success_count, fail_count, success_rate, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL)
    `);
    stmt.run(
      template.id,
      template.name,
      template.description,
      template.content,
      template.variables,
      template.categories,
      template.associatedKnowledgeDocs,
      template.isActive,
      template.isDefault,
      template.type,
      template.scenario || '[]'
    );
  }

  updateTemplate(id: string, updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt'>>): void {
    const fields = Object.keys(updates)
      .map(key => {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        return `${dbKey} = ?`;
      })
      .join(', ');

    const values = Object.values(updates);
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE prompt_templates
      SET ${fields}, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(...values, now, id);
  }

  deleteTemplate(id: string): void {
    const stmt = this.db.prepare('DELETE FROM prompt_templates WHERE id = ?');
    stmt.run(id);
  }

  incrementUseCount(id: string, success: boolean): void {
    const now = new Date().toISOString();
    if (success) {
      const stmt = this.db.prepare(`
        UPDATE prompt_templates
        SET use_count = use_count + 1,
            success_count = success_count + 1,
            success_rate = CASE WHEN use_count + 1 > 0 THEN (success_count + 1.0) / (use_count + 1) * 100 ELSE 100.0 END,
            last_used_at = ?,
            updated_at = ?
        WHERE id = ?
      `);
      stmt.run(now, now, id);
    } else {
      const stmt = this.db.prepare(`
        UPDATE prompt_templates
        SET use_count = use_count + 1,
            fail_count = fail_count + 1,
            success_rate = CASE WHEN use_count + 1 > 0 THEN success_count / (use_count + 1) * 100 ELSE 0.0 END,
            last_used_at = ?,
            updated_at = ?
        WHERE id = ?
      `);
      stmt.run(now, now, id);
    }
  }

  // Logs
  createLog(log: Omit<PromptTemplateLog, 'createdAt'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO prompt_template_logs
      (id, template_id, user_id, session_id, call_status, error_type, error_msg, variables, response_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      log.id,
      log.templateId,
      log.userId,
      log.sessionId,
      log.callStatus,
      log.errorType,
      log.errorMsg,
      log.variables,
      log.responseTime
    );
  }

  getLogsByTemplateId(templateId: string, limit: number = 100): PromptTemplateLog[] {
    const stmt = this.db.prepare('SELECT * FROM prompt_template_logs WHERE template_id = ? ORDER BY created_at DESC LIMIT ?');
    return stmt.all(templateId, limit) as PromptTemplateLog[];
  }

  // Versions
  createVersion(version: Omit<PromptTemplateVersion, 'createdAt'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO prompt_template_versions (id, template_id, content, version)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(version.id, version.templateId, version.content, version.version);
  }

  getVersionsByTemplateId(templateId: string): PromptTemplateVersion[] {
    const stmt = this.db.prepare('SELECT * FROM prompt_template_versions WHERE template_id = ? ORDER BY created_at DESC');
    return stmt.all(templateId) as PromptTemplateVersion[];
  }

  // Recalculate stats from logs
  recalculateStats(templateId: string): void {
    const logsStmt = this.db.prepare('SELECT * FROM prompt_template_logs WHERE template_id = ?');
    const logs = logsStmt.all(templateId) as PromptTemplateLog[];

    const total = logs.length;
    const success = logs.filter(l => l.callStatus === 1).length;
    const fail = logs.filter(l => l.callStatus === 0).length;
    const successRate = total > 0 ? (success / total) * 100 : 0;
    const lastLog = logs[0];

    this.updateTemplate(templateId, {
      useCount: total,
      successCount: success,
      failCount: fail,
      successRate: successRate,
      lastUsedAt: lastLog?.createdAt || null
    });
  }

  // 清空并重新从 JSON 导入
  reimportFromJson(templates: any[]): void {
    this.db.exec('DELETE FROM prompt_templates');
    for (const t of templates) {
      this.createTemplate({
        id: t.id,
        name: t.name,
        description: t.description,
        content: t.content,
        variables: JSON.stringify(t.variables || []),
        categories: JSON.stringify(t.categories || []),
        associatedKnowledgeDocs: JSON.stringify(t.associatedKnowledgeDocs || []),
        isActive: t.isActive ? 1 : 0,
        isDefault: t.isDefault ? 1 : 0,
        type: t.type || 'general',
        scenario: JSON.stringify(t.scenario || [])
      });
    }
  }
}

export const promptDb = new PromptDatabase();

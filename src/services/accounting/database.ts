// 财税模块数据库管理
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

const DB_DIR = path.join(process.cwd(), 'data', 'accounting');
const DB_PATH = path.join(DB_DIR, 'accounting.db');

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

      initTables();
      return db;
    } catch (error) {
      console.error('[Accounting DB] 数据库初始化失败:', error);
      initPromise = null; // 允许重试
      throw error;
    }
  })();

  return initPromise;
}

async function initTables() {
  const d = await getDB();

  // 账套表
  d.exec(`
    CREATE TABLE IF NOT EXISTS account_set (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      accounting_standard TEXT NOT NULL DEFAULT 'small',
      taxpayer_type TEXT NOT NULL DEFAULT 'general',
      currency TEXT NOT NULL DEFAULT 'CNY',
      start_period TEXT NOT NULL,
      current_period TEXT NOT NULL,
      is_closed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 会计科目表
  d.exec(`
    CREATE TABLE IF NOT EXISTS account (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      parent_code TEXT,
      category TEXT NOT NULL,
      balance_direction TEXT NOT NULL DEFAULT 'debit',
      is_system INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 期初余额表（支持多期间，复合主键）
  d.exec(`
    CREATE TABLE IF NOT EXISTS opening_balance (
      period TEXT NOT NULL,
      account_code TEXT NOT NULL,
      debit_amount REAL NOT NULL DEFAULT 0,
      credit_amount REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (period, account_code)
    )
  `);

  // 凭证表
  d.exec(`
    CREATE TABLE IF NOT EXISTS voucher (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL,
      date TEXT NOT NULL,
      period TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      source TEXT NOT NULL DEFAULT 'manual',
      source_id TEXT,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(number, period)
    )
  `);

  // 凭证分录表
  d.exec(`
    CREATE TABLE IF NOT EXISTS voucher_entry (
      id TEXT PRIMARY KEY,
      voucher_id TEXT NOT NULL,
      account_code TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      debit_amount REAL NOT NULL DEFAULT 0,
      credit_amount REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (voucher_id) REFERENCES voucher(id) ON DELETE CASCADE,
      FOREIGN KEY (account_code) REFERENCES account(code)
    )
  `);

  // 往来单位表
  d.exec(`
    CREATE TABLE IF NOT EXISTS contact (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'customer',
      tax_number TEXT,
      bank_name TEXT,
      bank_account TEXT,
      phone TEXT,
      address TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 结账记录表
  d.exec(`
    CREATE TABLE IF NOT EXISTS closing (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'open',
      closed_by TEXT,
      closed_at TEXT,
      reopened_by TEXT,
      reopened_at TEXT,
      profit_amount REAL NOT NULL DEFAULT 0,
      trial_balance INTEGER NOT NULL DEFAULT 0,
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

  // 申报记录表
  d.exec(`
    CREATE TABLE IF NOT EXISTS declaration (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL,
      tax_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      amount REAL NOT NULL DEFAULT 0,
      file_path TEXT,
      receipt_path TEXT,
      declared_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  // 创建索引
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_voucher_period ON voucher(period);
    CREATE INDEX IF NOT EXISTS idx_voucher_status ON voucher(status);
    CREATE INDEX IF NOT EXISTS idx_entry_voucher ON voucher_entry(voucher_id);
    CREATE INDEX IF NOT EXISTS idx_entry_account ON voucher_entry(account_code);
    CREATE INDEX IF NOT EXISTS idx_closing_period ON closing(period);
    CREATE INDEX IF NOT EXISTS idx_log_created ON operation_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_declaration_period ON declaration(period);
  `);

  // 初始化标准科目（小企业会计准则）
  initDefaultAccounts(d);
}

function initDefaultAccounts(d: any) {
  const count = d.prepare('SELECT COUNT(*) as c FROM account').get() as { c: number };
  if (count.c > 0) return;

  const accounts = [
    // 资产类
    { code: '1001', name: '库存现金', category: 'asset', direction: 'debit' },
    { code: '1002', name: '银行存款', category: 'asset', direction: 'debit' },
    { code: '1012', name: '其他货币资金', category: 'asset', direction: 'debit' },
    { code: '1101', name: '短期投资', category: 'asset', direction: 'debit' },
    { code: '1121', name: '应收票据', category: 'asset', direction: 'debit' },
    { code: '1122', name: '应收账款', category: 'asset', direction: 'debit' },
    { code: '1123', name: '预付账款', category: 'asset', direction: 'debit' },
    { code: '1131', name: '应收股利', category: 'asset', direction: 'debit' },
    { code: '1132', name: '应收利息', category: 'asset', direction: 'debit' },
    { code: '1221', name: '其他应收款', category: 'asset', direction: 'debit' },
    { code: '1401', name: '材料采购', category: 'asset', direction: 'debit' },
    { code: '1402', name: '在途物资', category: 'asset', direction: 'debit' },
    { code: '1403', name: '原材料', category: 'asset', direction: 'debit' },
    { code: '1404', name: '材料成本差异', category: 'asset', direction: 'debit' },
    { code: '1405', name: '库存商品', category: 'asset', direction: 'debit' },
    { code: '1407', name: '商品进销差价', category: 'asset', direction: 'debit' },
    { code: '1408', name: '委托加工物资', category: 'asset', direction: 'debit' },
    { code: '1411', name: '周转材料', category: 'asset', direction: 'debit' },
    { code: '1421', name: '消耗性生物资产', category: 'asset', direction: 'debit' },
    { code: '1501', name: '长期债券投资', category: 'asset', direction: 'debit' },
    { code: '1511', name: '长期股权投资', category: 'asset', direction: 'debit' },
    { code: '1601', name: '固定资产', category: 'asset', direction: 'debit' },
    { code: '1602', name: '累计折旧', category: 'asset', direction: 'credit' },
    { code: '1604', name: '在建工程', category: 'asset', direction: 'debit' },
    { code: '1605', name: '工程物资', category: 'asset', direction: 'debit' },
    { code: '1606', name: '固定资产清理', category: 'asset', direction: 'debit' },
    { code: '1621', name: '生产性生物资产', category: 'asset', direction: 'debit' },
    { code: '1622', name: '生产性生物资产累计折旧', category: 'asset', direction: 'credit' },
    { code: '1701', name: '无形资产', category: 'asset', direction: 'debit' },
    { code: '1702', name: '累计摊销', category: 'asset', direction: 'credit' },
    { code: '1801', name: '长期待摊费用', category: 'asset', direction: 'debit' },
    { code: '1901', name: '待处理财产损溢', category: 'asset', direction: 'debit' },

    // 负债类
    { code: '2001', name: '短期借款', category: 'liability', direction: 'credit' },
    { code: '2101', name: '应付票据', category: 'liability', direction: 'credit' },
    { code: '2102', name: '应付账款', category: 'liability', direction: 'credit' },
    { code: '2103', name: '预收账款', category: 'liability', direction: 'credit' },
    { code: '2211', name: '应付职工薪酬', category: 'liability', direction: 'credit' },
    { code: '2221', name: '应交税费', category: 'liability', direction: 'credit' },
    { code: '2231', name: '应付利息', category: 'liability', direction: 'credit' },
    { code: '2232', name: '应付利润', category: 'liability', direction: 'credit' },
    { code: '2241', name: '其他应付款', category: 'liability', direction: 'credit' },
    { code: '2401', name: '递延收益', category: 'liability', direction: 'credit' },
    { code: '2501', name: '长期借款', category: 'liability', direction: 'credit' },
    { code: '2701', name: '长期应付款', category: 'liability', direction: 'credit' },

    // 所有者权益类
    { code: '3001', name: '实收资本', category: 'equity', direction: 'credit' },
    { code: '3002', name: '资本公积', category: 'equity', direction: 'credit' },
    { code: '3101', name: '盈余公积', category: 'equity', direction: 'credit' },
    { code: '3103', name: '本年利润', category: 'equity', direction: 'credit' },
    { code: '3104', name: '利润分配', category: 'equity', direction: 'credit' },

    // 成本类
    { code: '4001', name: '生产成本', category: 'cost', direction: 'debit' },
    { code: '4101', name: '制造费用', category: 'cost', direction: 'debit' },
    { code: '4301', name: '研发支出', category: 'cost', direction: 'debit' },
    { code: '4401', name: '工程施工', category: 'cost', direction: 'debit' },
    { code: '4403', name: '机械作业', category: 'cost', direction: 'debit' },

    // 损益类 - 收入
    { code: '5001', name: '主营业务收入', category: 'revenue', direction: 'credit' },
    { code: '5051', name: '其他业务收入', category: 'revenue', direction: 'credit' },
    { code: '5111', name: '投资收益', category: 'revenue', direction: 'credit' },
    { code: '5301', name: '营业外收入', category: 'revenue', direction: 'credit' },

    // 损益类 - 费用
    { code: '5401', name: '主营业务成本', category: 'expense', direction: 'debit' },
    { code: '5402', name: '其他业务成本', category: 'expense', direction: 'debit' },
    { code: '5403', name: '税金及附加', category: 'expense', direction: 'debit' },
    { code: '5601', name: '销售费用', category: 'expense', direction: 'debit' },
    { code: '5602', name: '管理费用', category: 'expense', direction: 'debit' },
    { code: '5603', name: '财务费用', category: 'expense', direction: 'debit' },
    { code: '5711', name: '营业外支出', category: 'expense', direction: 'debit' },
    { code: '5801', name: '所得税费用', category: 'expense', direction: 'debit' },
  ];

  const insert = d.prepare(
    'INSERT OR IGNORE INTO account (code, name, level, category, balance_direction, is_system) VALUES (?, ?, 1, ?, ?, 1)'
  );

  const transaction = d.transaction(() => {
    for (const a of accounts) {
      insert.run(a.code, a.name, a.category, a.direction);
    }
  });

  transaction();
  console.log(`已初始化 ${accounts.length} 个标准会计科目`);
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

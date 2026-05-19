// 凭证服务
import { getDB, addLog } from './database';

// 生成凭证ID
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// 生成凭证编号：记-月份-序号
function generateVoucherNumber(db: any, period: string): string {
  const month = period.slice(-2);
  const count = getVoucherCount(period);
  const seq = String(count + 1).padStart(4, '0');
  return `记-${month}-${seq}`;
}

// 校验期间是否未结账
function checkPeriodOpen(db: any, period: string) {
  const closing = db.prepare('SELECT status FROM closing WHERE period = ?').get(period) as any;
  if (closing && closing.status === 'closed') {
    throw new Error(`期间 ${period} 已结账，不能进行此操作`);
  }
}

// 校验借贷平衡
function checkBalance(entries: { debit_amount: number; credit_amount: number }[]) {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const entry of entries) {
    totalDebit += entry.debit_amount;
    totalCredit += entry.credit_amount;
  }
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`借贷不平衡：借方合计 ${totalDebit}，贷方合计 ${totalCredit}，差额 ${Math.abs(totalDebit - totalCredit)}`);
  }
}

// 创建凭证
export async function createVoucher(params: {
  date: string;
  period: string;
  summary: string;
  entries: { account_code: string; summary: string; debit_amount: number; credit_amount: number }[];
  source?: string;
  source_id?: string;
  created_by?: string;
}) {
  try {
    const db = await getDB();

    // 校验期间未结账
    checkPeriodOpen(db, params.period);

    // 校验借贷平衡
    checkBalance(params.entries);

    // 校验科目存在
    for (const entry of params.entries) {
      const account = db.prepare('SELECT code FROM account WHERE code = ?').get(entry.account_code);
      if (!account) {
        throw new Error(`科目 ${entry.account_code} 不存在`);
      }
    }

    // 生成凭证编号和ID
    const id = generateId('v');
    const number = generateVoucherNumber(db, params.period);

    const insertVoucher = db.prepare(
      `INSERT INTO voucher (id, number, date, period, summary, status, source, source_id, created_by)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
    );

    const insertEntry = db.prepare(
      `INSERT INTO voucher_entry (id, voucher_id, account_code, summary, debit_amount, credit_amount, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const transaction = db.transaction(() => {
      insertVoucher.run(id, number, params.date, params.period, params.summary, params.source || 'manual', params.source_id || null, params.created_by || '');

      params.entries.forEach((entry, index) => {
        const entryId = generateId('ve');
        insertEntry.run(entryId, id, entry.account_code, entry.summary, entry.debit_amount, entry.credit_amount, index + 1);
      });
    });

    transaction();

    addLog(params.created_by || '', 'create', 'voucher', id, `创建凭证：${number}`);

    return getVoucher(id);
  } catch (error: any) {
    if (error.message.includes('已结账') || error.message.includes('借贷不平衡') || error.message.includes('科目') || error.message.includes('不存在')) {
      throw error;
    }
    throw new Error(`创建凭证失败：${error.message}`);
  }
}

// 更新凭证
export async function updateVoucher(
  id: string,
  params: {
    date?: string;
    summary?: string;
    entries?: { account_code: string; summary: string; debit_amount: number; credit_amount: number }[];
  }
) {
  try {
    const db = await getDB();

    // 校验凭证存在
    const voucher = db.prepare('SELECT * FROM voucher WHERE id = ?').get(id) as any;
    if (!voucher) {
      throw new Error(`凭证 ${id} 不存在`);
    }

    // 校验未结账
    checkPeriodOpen(db, voucher.period);

    // 如果更新了分录，校验借贷平衡和科目
    if (params.entries && params.entries.length > 0) {
      checkBalance(params.entries);

      for (const entry of params.entries) {
        const account = db.prepare('SELECT code FROM account WHERE code = ?').get(entry.account_code);
        if (!account) {
          throw new Error(`科目 ${entry.account_code} 不存在`);
        }
      }
    }

    const transaction = db.transaction(() => {
      // 更新凭证头
      if (params.date || params.summary) {
        db.prepare(
          'UPDATE voucher SET date = COALESCE(?, date), summary = COALESCE(?, summary), updated_at = datetime(\'now\',\'localtime\') WHERE id = ?'
        ).run(params.date || null, params.summary || null, id);
      }

      // 更新分录
      if (params.entries && params.entries.length > 0) {
        // 删除旧分录
        db.prepare('DELETE FROM voucher_entry WHERE voucher_id = ?').run(id);

        // 插入新分录
        const insertEntry = db.prepare(
          `INSERT INTO voucher_entry (id, voucher_id, account_code, summary, debit_amount, credit_amount, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        params.entries.forEach((entry, index) => {
          const entryId = generateId('ve');
          insertEntry.run(entryId, id, entry.account_code, entry.summary, entry.debit_amount, entry.credit_amount, index + 1);
        });
      }
    });

    transaction();

    addLog('', 'update', 'voucher', id, `更新凭证：${voucher.number}`);

    return getVoucher(id);
  } catch (error: any) {
    if (error.message.includes('已结账') || error.message.includes('借贷不平衡') || error.message.includes('科目') || error.message.includes('不存在')) {
      throw error;
    }
    throw new Error(`更新凭证失败：${error.message}`);
  }
}

// 删除凭证
export async function deleteVoucher(id: string) {
  try {
    const db = await getDB();

    const voucher = db.prepare('SELECT * FROM voucher WHERE id = ?').get(id) as any;
    if (!voucher) {
      throw new Error(`凭证 ${id} 不存在`);
    }

    checkPeriodOpen(db, voucher.period);

    db.transaction(() => {
      db.prepare('DELETE FROM voucher_entry WHERE voucher_id = ?').run(id);
      db.prepare('DELETE FROM voucher WHERE id = ?').run(id);
    })();

    addLog('', 'delete', 'voucher', id, `删除凭证：${voucher.number}`);
  } catch (error: any) {
    if (error.message.includes('已结账') || error.message.includes('不存在')) {
      throw error;
    }
    throw new Error(`删除凭证失败：${error.message}`);
  }
}

// 查询凭证列表（分页）
export async function getVouchers(period?: string, status?: string, page?: number, pageSize?: number) {
  try {
    const db = await getDB();
    const p = page || 1;
    const size = pageSize || 20;
    const offset = (p - 1) * size;

    let whereSql = 'WHERE 1=1';
    const params: any[] = [];

    if (period) {
      whereSql += ' AND v.period = ?';
      params.push(period);
    }

    if (status) {
      whereSql += ' AND v.status = ?';
      params.push(status);
    }

    // 查询总数
    const countResult = db.prepare(`SELECT COUNT(*) as total FROM voucher v ${whereSql}`).get(...params) as any;
    const total = countResult.total;

    // 查询分页数据
    const list = db.prepare(
      `SELECT v.*, (SELECT COUNT(*) FROM voucher_entry WHERE voucher_id = v.id) as entry_count
       FROM voucher v ${whereSql}
       ORDER BY v.date DESC, v.number DESC
       LIMIT ? OFFSET ?`
    ).all(...params, size, offset) as any[];

    return {
      list,
      total,
      page: p,
      pageSize: size,
      totalPages: Math.ceil(total / size),
    };
  } catch (error: any) {
    throw new Error(`查询凭证列表失败：${error.message}`);
  }
}

// 获取单个凭证详情（含分录）
export async function getVoucher(id: string) {
  try {
    const db = await getDB();

    const voucher = db.prepare('SELECT * FROM voucher WHERE id = ?').get(id) as any;
    if (!voucher) {
      throw new Error(`凭证 ${id} 不存在`);
    }

    const entries = db.prepare(
      'SELECT * FROM voucher_entry WHERE voucher_id = ? ORDER BY sort_order'
    ).all(id) as any[];

    return {
      ...voucher,
      entries,
    };
  } catch (error: any) {
    if (error.message.includes('不存在')) {
      throw error;
    }
    throw new Error(`获取凭证详情失败：${error.message}`);
  }
}

// 审核凭证
export async function confirmVoucher(id: string, operator: string) {
  try {
    const db = await getDB();

    const voucher = db.prepare('SELECT * FROM voucher WHERE id = ?').get(id) as any;
    if (!voucher) {
      throw new Error(`凭证 ${id} 不存在`);
    }

    if (voucher.status !== 'draft') {
      throw new Error(`凭证 ${voucher.number} 当前状态为 ${voucher.status}，只有草稿状态的凭证才能审核`);
    }

    checkPeriodOpen(db, voucher.period);

    db.prepare(
      "UPDATE voucher SET status = 'confirmed', updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(id);

    addLog(operator, 'confirm', 'voucher', id, `审核凭证：${voucher.number}`);

    return getVoucher(id);
  } catch (error: any) {
    if (error.message.includes('不存在') || error.message.includes('当前状态') || error.message.includes('已结账')) {
      throw error;
    }
    throw new Error(`审核凭证失败：${error.message}`);
  }
}

// 获取某期间凭证数量（用于编号）
export async function getVoucherCount(period: string): Promise<number> {
  try {
    const db = await getDB();
    const result = db.prepare('SELECT COUNT(*) as c FROM voucher WHERE period = ?').get(period) as { c: number };
    return result.c;
  } catch (error: any) {
    throw new Error(`获取凭证数量失败：${error.message}`);
  }
}

// 获取某期间所有已确认凭证的分录汇总
export async function getPeriodEntries(period: string) {
  try {
    const db = await getDB();

    const entries = db.prepare(
      `SELECT ve.account_code, a.name as account_name, a.category, a.balance_direction,
              SUM(ve.debit_amount) as total_debit, SUM(ve.credit_amount) as total_credit
       FROM voucher_entry ve
       JOIN voucher v ON ve.voucher_id = v.id
       JOIN account a ON ve.account_code = a.code
       WHERE v.period = ? AND v.status = 'confirmed'
       GROUP BY ve.account_code
       ORDER BY ve.account_code`
    ).all(period) as {
      account_code: string;
      account_name: string;
      category: string;
      balance_direction: string;
      total_debit: number;
      total_credit: number;
    }[];

    return entries;
  } catch (error: any) {
    throw new Error(`获取期间分录汇总失败：${error.message}`);
  }
}

// 科目服务
import { getDB, addLog } from './database';

// 获取科目列表
export async function getAccounts(category?: string) {
  try {
    const db = await getDB();
    let sql = 'SELECT code, name, level, parent_code, category, balance_direction, is_system, is_active FROM account WHERE 1=1';
    const params: any[] = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY code';
    return db.prepare(sql).all(...params) as {
      code: string;
      name: string;
      level: number;
      parent_code: string | null;
      category: string;
      balance_direction: string;
      is_system: number;
      is_active: number;
    }[];
  } catch (error: any) {
    throw new Error(`获取科目列表失败：${error.message}`);
  }
}

// 创建二级科目
export async function createAccount(code: string, name: string, parentCode: string, category: string, direction: string) {
  try {
    const db = await getDB();

    // 校验父科目存在
    const parent = db.prepare('SELECT * FROM account WHERE code = ?').get(parentCode) as any;
    if (!parent) {
      throw new Error(`父科目 ${parentCode} 不存在`);
    }

    // 校验code格式：父code + 两位数字
    if (!code.startsWith(parentCode) || code.length !== parentCode.length + 2) {
      throw new Error(`科目编码格式不正确，应为父科目编码 ${parentCode} 加两位数字`);
    }

    const codeSuffix = code.slice(parentCode.length);
    if (!/^\d{2}$/.test(codeSuffix)) {
      throw new Error(`科目编码后缀必须为两位数字`);
    }

    // 校验编码是否已存在
    const existing = db.prepare('SELECT code FROM account WHERE code = ?').get(code);
    if (existing) {
      throw new Error(`科目编码 ${code} 已存在`);
    }

    db.prepare(
      'INSERT INTO account (code, name, level, parent_code, category, balance_direction, is_system, is_active) VALUES (?, ?, 2, ?, ?, ?, 0, 1)'
    ).run(code, name, parentCode, category, direction);

    addLog('', 'create', 'account', code, `创建科目：${name}（${code}）`);

    return db.prepare('SELECT * FROM account WHERE code = ?').get(code);
  } catch (error: any) {
    if (error.message.includes('获取科目列表失败') || error.message.includes('父科目') || error.message.includes('科目编码')) {
      throw error;
    }
    throw new Error(`创建科目失败：${error.message}`);
  }
}

// 修改科目名称
export async function updateAccount(code: string, name: string) {
  try {
    const db = await getDB();

    const account = db.prepare('SELECT * FROM account WHERE code = ?').get(code) as any;
    if (!account) {
      throw new Error(`科目 ${code} 不存在`);
    }

    if (account.is_system) {
      throw new Error(`系统科目 ${code}（${account.name}）不可修改名称`);
    }

    db.prepare('UPDATE account SET name = ? WHERE code = ?').run(name, code);

    addLog('', 'update', 'account', code, `修改科目名称：${account.name} -> ${name}`);

    return db.prepare('SELECT * FROM account WHERE code = ?').get(code);
  } catch (error: any) {
    if (error.message.includes('科目') || error.message.includes('系统科目')) {
      throw error;
    }
    throw new Error(`修改科目失败：${error.message}`);
  }
}

// 获取某期初期余额
export async function getOpeningBalances(period: string) {
  try {
    const db = await getDB();
    return db.prepare(
      'SELECT account_code, debit_amount, credit_amount FROM opening_balance WHERE period = ? ORDER BY account_code'
    ).all(period) as { account_code: string; debit_amount: number; credit_amount: number }[];
  } catch (error: any) {
    throw new Error(`获取期初余额失败：${error.message}`);
  }
}

// 批量保存期初余额
export async function saveOpeningBalances(
  period: string,
  balances: { account_code: string; debit_amount: number; credit_amount: number }[]
) {
  try {
    const db = await getDB();

    // 校验借贷平衡
    let totalDebit = 0;
    let totalCredit = 0;
    for (const b of balances) {
      totalDebit += b.debit_amount;
      totalCredit += b.credit_amount;
    }
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`借贷不平衡：借方合计 ${totalDebit}，贷方合计 ${totalCredit}，差额 ${Math.abs(totalDebit - totalCredit)}`);
    }

    const deleteStmt = db.prepare('DELETE FROM opening_balance WHERE period = ?');
    const insertStmt = db.prepare(
      'INSERT INTO opening_balance (account_code, debit_amount, credit_amount, period) VALUES (?, ?, ?, ?)'
    );

    const transaction = db.transaction(() => {
      deleteStmt.run(period);
      for (const b of balances) {
        insertStmt.run(b.account_code, b.debit_amount, b.credit_amount, period);
      }
    });

    transaction();

    addLog('', 'save', 'opening_balance', period, `保存期初余额，共 ${balances.length} 条记录`);
  } catch (error: any) {
    if (error.message.includes('借贷不平衡')) {
      throw error;
    }
    throw new Error(`保存期初余额失败：${error.message}`);
  }
}

// 计算某科目在某期的余额
export async function getAccountBalance(accountCode: string, period: string) {
  try {
    const db = await getDB();

    // 获取科目信息
    const account = db.prepare('SELECT * FROM account WHERE code = ?').get(accountCode) as any;
    if (!account) {
      throw new Error(`科目 ${accountCode} 不存在`);
    }

    // 获取期初余额
    const opening = db.prepare(
      'SELECT debit_amount, credit_amount FROM opening_balance WHERE account_code = ? AND period = ?'
    ).get(accountCode, period) as any;

    const openingDebit = opening?.debit_amount || 0;
    const openingCredit = opening?.credit_amount || 0;

    // 获取本期借方发生额合计
    const periodDebit = db.prepare(
      `SELECT COALESCE(SUM(ve.debit_amount), 0) as total
       FROM voucher_entry ve
       JOIN voucher v ON ve.voucher_id = v.id
       WHERE ve.account_code = ? AND v.period = ? AND v.status = 'confirmed'`
    ).get(accountCode, period) as any;

    // 获取本期贷方发生额合计
    const periodCredit = db.prepare(
      `SELECT COALESCE(SUM(ve.credit_amount), 0) as total
       FROM voucher_entry ve
       JOIN voucher v ON ve.voucher_id = v.id
       WHERE ve.account_code = ? AND v.period = ? AND v.status = 'confirmed'`
    ).get(accountCode, period) as any;

    const debitTotal = openingDebit + (periodDebit?.total || 0);
    const creditTotal = openingCredit + (periodCredit?.total || 0);

    // 根据科目方向计算余额
    let balance = 0;
    if (account.balance_direction === 'debit') {
      balance = debitTotal - creditTotal;
    } else {
      balance = creditTotal - debitTotal;
    }

    return {
      account_code: accountCode,
      account_name: account.name,
      balance_direction: account.balance_direction,
      opening_debit: openingDebit,
      opening_credit: openingCredit,
      period_debit: periodDebit?.total || 0,
      period_credit: periodCredit?.total || 0,
      balance,
    };
  } catch (error: any) {
    if (error.message.includes('科目')) {
      throw error;
    }
    throw new Error(`获取科目余额失败：${error.message}`);
  }
}

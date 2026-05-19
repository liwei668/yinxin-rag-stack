// 结账服务 - 期间结账、反结账、税金计提、损益结转
import { getDB, addLog } from './database';
import { getTrialBalance, getIncomeStatement } from './reportService';

/**
 * 获取结账状态
 */
export async function getClosingStatus(period: string) {
  try {
    const db = await getDB();

    const record = db.prepare('SELECT * FROM closing WHERE period = ?').get(period) as
      | {
          id: string;
          period: string;
          status: string;
          closed_by: string | null;
          closed_at: string | null;
          reopened_by: string | null;
          reopened_at: string | null;
          profit_amount: number;
          trial_balance: number;
          created_at: string;
        }
      | undefined;

    if (!record) {
      return {
        period,
        status: 'open',
        closed_by: null,
        closed_at: null,
      };
    }

    return {
      period: record.period,
      status: record.status,
      closed_by: record.closed_by,
      closed_at: record.closed_at,
    };
  } catch (error) {
    throw new Error(`获取结账状态失败：${(error as Error).message}`);
  }
}

/**
 * 检查期间是否已结账
 */
export async function isPeriodClosed(period: string): Promise<boolean> {
  try {
    const db = await getDB();

    const record = db.prepare('SELECT status FROM closing WHERE period = ?').get(period) as
      | { status: string }
      | undefined;

    return record?.status === 'closed';
  } catch (error) {
    throw new Error(`检查结账状态失败：${(error as Error).message}`);
  }
}

/**
 * 结账
 */
export async function closePeriod(period: string, operator: string) {
  try {
    const db = await getDB();

    // 校验该期间有已确认凭证
    const voucherCount = db
      .prepare("SELECT COUNT(*) AS count FROM voucher WHERE period = ? AND status = 'confirmed'")
      .get(period) as { count: number };

    if (voucherCount.count === 0) {
      throw new Error(`期间 ${period} 没有已确认的凭证，无法结账`);
    }

    // 校验该期间未结账
    if (isPeriodClosed(period)) {
      throw new Error(`期间 ${period} 已结账，不能重复结账`);
    }

    // 校验试算平衡
    const trialBalance = getTrialBalance(period);
    if (!trialBalance.is_balanced) {
      throw new Error(
        `期间 ${period} 试算不平衡，借方合计 ${trialBalance.total_debit}，贷方合计 ${trialBalance.total_credit}，差额 ${Math.abs(trialBalance.total_debit - trialBalance.total_credit)}`
      );
    }

    // 计算本月净利润（收入合计 - 费用合计）
    const incomeStatement = getIncomeStatement(period);
    const profitAmount = incomeStatement.total_profit;

    // 插入或更新 closing 记录
    const existing = db.prepare('SELECT id FROM closing WHERE period = ?').get(period) as
      | { id: string }
      | undefined;

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    if (existing) {
      db.prepare(
        `UPDATE closing
         SET status = 'closed', closed_by = ?, closed_at = ?, profit_amount = ?, trial_balance = 1
         WHERE period = ?`
      ).run(operator, now, profitAmount, period);
    } else {
      db.prepare(
        `INSERT INTO closing (id, period, status, closed_by, closed_at, profit_amount, trial_balance)
         VALUES (?, ?, 'closed', ?, ?, ?, 1)`
      ).run(`closing_${Date.now()}`, period, operator, now, profitAmount);
    }

    // 添加操作日志
    addLog(operator, 'close_period', 'closing', period, `结账期间 ${period}，净利润 ${profitAmount}`);

    return {
      success: true,
      profit_amount: Math.round(profitAmount * 100) / 100,
      trial_balance: {
        total_debit: trialBalance.total_debit,
        total_credit: trialBalance.total_credit,
        is_balanced: trialBalance.is_balanced,
      },
    };
  } catch (error) {
    throw new Error(`结账失败：${(error as Error).message}`);
  }
}

/**
 * 反结账
 */
export async function reopenPeriod(period: string, operator: string) {
  try {
    const db = await getDB();

    // 校验该期间已结账
    if (!isPeriodClosed(period)) {
      throw new Error(`期间 ${period} 未结账，无需反结账`);
    }

    // 计算下一个期间（简单处理：月份+1）
    const [year, month] = period.split('-').map(Number);
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    const nextPeriod = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;

    // 校验下一个期间未结账（不能跳过反结账）
    if (isPeriodClosed(nextPeriod)) {
      throw new Error(`下一个期间 ${nextPeriod} 已结账，请先反结账 ${nextPeriod}，不能跳过反结账`);
    }

    // 更新 closing 记录
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    db.prepare(
      `UPDATE closing
       SET status = 'open', closed_by = NULL, closed_at = NULL, reopened_by = ?, reopened_at = ?
       WHERE period = ?`
    ).run(operator, now, period);

    // 添加操作日志
    addLog(operator, 'reopen_period', 'closing', period, `反结账期间 ${period}`);

    return {
      success: true,
    };
  } catch (error) {
    throw new Error(`反结账失败：${(error as Error).message}`);
  }
}

/**
 * 生成税金计提凭证
 * 注意：只生成凭证数据对象，不直接写入数据库
 */
export async function generateTaxProvision(period: string, taxpayerType: string) {
  try {
    const db = await getDB();

    let vatAmount = 0;

    if (taxpayerType === 'general') {
      // 一般纳税人：销项税(2221-01-01贷方) - 进项税(2221-01-01借方)
      const outputVAT = db.prepare(`
        SELECT COALESCE(SUM(e.credit_amount), 0) AS total
        FROM voucher_entry e
        INNER JOIN voucher v ON e.voucher_id = v.id
        WHERE v.period = ? AND v.status = 'confirmed'
          AND e.account_code LIKE '2221%'
          AND e.credit_amount > 0
      `).get(period) as { total: number };

      const inputVAT = db.prepare(`
        SELECT COALESCE(SUM(e.debit_amount), 0) AS total
        FROM voucher_entry e
        INNER JOIN voucher v ON e.voucher_id = v.id
        WHERE v.period = ? AND v.status = 'confirmed'
          AND e.account_code LIKE '2221%'
          AND e.debit_amount > 0
      `).get(period) as { total: number };

      vatAmount = outputVAT.total - inputVAT.total;
    } else {
      // 小规模纳税人：收入 x 征税率(3%)
      const revenue = db.prepare(`
        SELECT COALESCE(SUM(e.credit_amount), 0) AS total
        FROM voucher_entry e
        INNER JOIN voucher v ON e.voucher_id = v.id
        INNER JOIN account a ON e.account_code = a.code
        WHERE v.period = ? AND v.status = 'confirmed' AND a.category = 'revenue'
      `).get(period) as { total: number };

      vatAmount = revenue.total * 0.03;
    }

    // 如果应交增值税为负或为零，不需要计提附加税
    if (vatAmount <= 0) {
      return {
        voucher: null,
        message: '本期应交增值税为零或负数，无需计提附加税',
      };
    }

    // 计算附加税
    const cityTax = Math.round(vatAmount * 0.07 * 100) / 100;       // 城建税 7%
    const educationSurcharge = Math.round(vatAmount * 0.03 * 100) / 100;   // 教育费附加 3%
    const localEducationSurcharge = Math.round(vatAmount * 0.02 * 100) / 100; // 地方教育附加 2%
    const totalSurcharge = cityTax + educationSurcharge + localEducationSurcharge;

    // 生成凭证数据对象
    const voucherId = `voucher_tax_${Date.now()}`;
    const voucherNumber = `SJ-${period.replace('-', '')}-${String(Date.now()).slice(-6)}`;

    const voucher = {
      id: voucherId,
      number: voucherNumber,
      date: `${period}-28`,
      period,
      summary: `计提${period}税金及附加`,
      status: 'draft',
      source: 'auto_tax',
      source_id: null,
      created_by: 'system',
      entries: [
        {
          id: `${voucherId}_1`,
          voucher_id: voucherId,
          account_code: '5403',
          summary: `计提${period}税金及附加`,
          debit_amount: totalSurcharge,
          credit_amount: 0,
          sort_order: 1,
        },
        {
          id: `${voucherId}_2`,
          voucher_id: voucherId,
          account_code: '2221',
          summary: '城建税 7%',
          debit_amount: 0,
          credit_amount: cityTax,
          sort_order: 2,
        },
        {
          id: `${voucherId}_3`,
          voucher_id: voucherId,
          account_code: '2221',
          summary: '教育费附加 3%',
          debit_amount: 0,
          credit_amount: educationSurcharge,
          sort_order: 3,
        },
        {
          id: `${voucherId}_4`,
          voucher_id: voucherId,
          account_code: '2221',
          summary: '地方教育附加 2%',
          debit_amount: 0,
          credit_amount: localEducationSurcharge,
          sort_order: 4,
        },
      ],
    };

    return {
      voucher,
      vat_amount: Math.round(vatAmount * 100) / 100,
      city_tax: cityTax,
      education_surcharge: educationSurcharge,
      local_education_surcharge: localEducationSurcharge,
      totalSurcharge,
    };
  } catch (error) {
    throw new Error(`生成税金计提凭证失败：${(error as Error).message}`);
  }
}

/**
 * 生成损益结转凭证
 * 注意：只生成凭证数据对象，不直接写入数据库
 */
export async function generateProfitTransfer(period: string) {
  try {
    const db = await getDB();

    // 查询该期间所有收入类科目的贷方发生额合计
    const revenueRows = db.prepare(`
      SELECT
        a.code AS account_code,
        a.name AS account_name,
        COALESCE(SUM(e.credit_amount), 0) - COALESCE(SUM(e.debit_amount), 0) AS net_amount
      FROM voucher_entry e
      INNER JOIN voucher v ON e.voucher_id = v.id
      INNER JOIN account a ON e.account_code = a.code
      WHERE v.period = ? AND v.status = 'confirmed' AND a.category = 'revenue'
      GROUP BY e.account_code
      HAVING net_amount > 0
      ORDER BY a.code
    `).all(period) as Array<{ account_code: string; account_name: string; net_amount: number }>;

    // 查询该期间所有费用类科目的借方发生额合计
    const expenseRows = db.prepare(`
      SELECT
        a.code AS account_code,
        a.name AS account_name,
        COALESCE(SUM(e.debit_amount), 0) - COALESCE(SUM(e.credit_amount), 0) AS net_amount
      FROM voucher_entry e
      INNER JOIN voucher v ON e.voucher_id = v.id
      INNER JOIN account a ON e.account_code = a.code
      WHERE v.period = ? AND v.status = 'confirmed' AND a.category IN ('expense', 'cost')
      GROUP BY e.account_code
      HAVING net_amount > 0
      ORDER BY a.code
    `).all(period) as Array<{ account_code: string; account_name: string; net_amount: number }>;

    const totalRevenue = revenueRows.reduce((sum, r) => sum + r.net_amount, 0);
    const totalExpense = expenseRows.reduce((sum, e) => sum + e.net_amount, 0);

    // 如果收入和费用都为零，无需结转
    if (totalRevenue === 0 && totalExpense === 0) {
      return {
        voucher: null,
        message: '本期无收入和费用发生额，无需结转损益',
      };
    }

    // 生成凭证数据对象
    const voucherId = `voucher_profit_${Date.now()}`;
    const voucherNumber = `SY-${period.replace('-', '')}-${String(Date.now()).slice(-6)}`;

    const entries: Array<{
      id: string;
      voucher_id: string;
      account_code: string;
      summary: string;
      debit_amount: number;
      credit_amount: number;
      sort_order: number;
    }> = [];

    let sortOrder = 1;

    // 收入类科目借方清零 -> 本年利润贷方
    for (const rev of revenueRows) {
      entries.push({
        id: `${voucherId}_${sortOrder}`,
        voucher_id: voucherId,
        account_code: rev.account_code,
        summary: `结转${period}收入至本年利润`,
        debit_amount: Math.round(rev.net_amount * 100) / 100,
        credit_amount: 0,
        sort_order: sortOrder++,
      });
    }

    // 本年利润借方 -> 费用类科目贷方清零
    if (totalExpense > 0) {
      entries.push({
        id: `${voucherId}_${sortOrder}`,
        voucher_id: voucherId,
        account_code: '3103',
        summary: `结转${period}费用至本年利润`,
        debit_amount: Math.round(totalExpense * 100) / 100,
        credit_amount: 0,
        sort_order: sortOrder++,
      });
    }

    for (const exp of expenseRows) {
      entries.push({
        id: `${voucherId}_${sortOrder}`,
        voucher_id: voucherId,
        account_code: exp.account_code,
        summary: `结转${period}费用至本年利润`,
        debit_amount: 0,
        credit_amount: Math.round(exp.net_amount * 100) / 100,
        sort_order: sortOrder++,
      });
    }

    // 本年利润贷方（收入合计）
    if (totalRevenue > 0) {
      entries.push({
        id: `${voucherId}_${sortOrder}`,
        voucher_id: voucherId,
        account_code: '3103',
        summary: `结转${period}收入至本年利润`,
        debit_amount: 0,
        credit_amount: Math.round(totalRevenue * 100) / 100,
        sort_order: sortOrder++,
      });
    }

    const voucher = {
      id: voucherId,
      number: voucherNumber,
      date: `${period}-28`,
      period,
      summary: `结转${period}损益`,
      status: 'draft',
      source: 'auto_profit',
      source_id: null,
      created_by: 'system',
      entries,
    };

    return {
      voucher,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_expense: Math.round(totalExpense * 100) / 100,
      net_profit: Math.round((totalRevenue - totalExpense) * 100) / 100,
    };
  } catch (error) {
    throw new Error(`生成损益结转凭证失败：${(error as Error).message}`);
  }
}

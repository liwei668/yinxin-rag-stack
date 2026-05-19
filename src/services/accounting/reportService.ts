// 报表服务 - 试算平衡表、资产负债表、利润表、明细账
import { getDB } from './database';

/**
 * 试算平衡表
 */
export async function getTrialBalance(period: string) {
  try {
    const db = await getDB();

    // 查询该期间所有已确认凭证的分录，按科目汇总
    const entries = db.prepare(`
      SELECT
        e.account_code,
        a.name AS account_name,
        a.category,
        a.balance_direction AS direction,
        COALESCE(SUM(e.debit_amount), 0) AS period_debit,
        COALESCE(SUM(e.credit_amount), 0) AS period_credit
      FROM voucher_entry e
      INNER JOIN voucher v ON e.voucher_id = v.id
      INNER JOIN account a ON e.account_code = a.code
      WHERE v.period = ? AND v.status = 'confirmed'
      GROUP BY e.account_code
      ORDER BY e.account_code
    `).all(period) as Array<{
      account_code: string;
      account_name: string;
      category: string;
      direction: string;
      period_debit: number;
      period_credit: number;
    }>;

    // 查询期初余额
    const openingBalances = db.prepare(`
      SELECT account_code, debit_amount, credit_amount
      FROM opening_balance
      WHERE period = ?
    `).all(period) as Array<{
      account_code: string;
      debit_amount: number;
      credit_amount: number;
    }>;

    const openingMap = new Map<string, { debit_amount: number; credit_amount: number }>();
    for (const ob of openingBalances) {
      openingMap.set(ob.account_code, { debit_amount: ob.debit_amount, credit_amount: ob.credit_amount });
    }

    // 合并本期有发生额的科目和仅有期初余额的科目
    const allCodes = new Set<string>();
    for (const e of entries) allCodes.add(e.account_code);
    for (const ob of openingBalances) allCodes.add(ob.account_code);

    // 查询所有相关科目的基本信息
    const entriesMap = new Map<string, typeof entries[0]>();
    for (const e of entries) entriesMap.set(e.account_code, e);

    // 查询科目信息（用于仅有期初余额但无本期发生额的科目）
    const accountInfos = db.prepare(`
      SELECT code, name, category, balance_direction AS direction
      FROM account
      WHERE code IN (${Array.from(allCodes).map(() => '?').join(',')})
    `).all(...allCodes) as Array<{
      code: string;
      name: string;
      category: string;
      direction: string;
    }>;

    const accountMap = new Map<string, typeof accountInfos[0]>();
    for (const a of accountInfos) accountMap.set(a.code, a);

    // 构建明细行
    const details: Array<{
      account_code: string;
      account_name: string;
      category: string;
      direction: string;
      opening_debit: number;
      opening_credit: number;
      period_debit: number;
      period_credit: number;
      closing_debit: number;
      closing_credit: number;
    }> = [];

    for (const code of allCodes) {
      const entry = entriesMap.get(code);
      const account = accountMap.get(code);
      const opening = openingMap.get(code) || { debit_amount: 0, credit_amount: 0 };

      if (!account) continue;

      const openingDebit = opening.debit_amount;
      const openingCredit = opening.credit_amount;
      const periodDebit = entry?.period_debit || 0;
      const periodCredit = entry?.period_credit || 0;

      // 计算期末余额
      let closingDebit = 0;
      let closingCredit = 0;

      if (account.direction === 'debit') {
        const bal = openingDebit - openingCredit + periodDebit - periodCredit;
        if (bal >= 0) { closingDebit = bal; } else { closingCredit = Math.abs(bal); }
      } else {
        const bal = openingCredit - openingDebit + periodCredit - periodDebit;
        if (bal >= 0) { closingCredit = bal; } else { closingDebit = Math.abs(bal); }
      }

      // 跳过借贷都为0的科目
      if (Math.abs(closingDebit) < 0.01 && Math.abs(closingCredit) < 0.01 &&
          Math.abs(openingDebit) < 0.01 && Math.abs(openingCredit) < 0.01 &&
          Math.abs(periodDebit) < 0.01 && Math.abs(periodCredit) < 0.01) continue;

      details.push({
        account_code: code,
        account_name: account.name,
        category: account.category,
        direction: account.direction,
        opening_debit: openingDebit,
        opening_credit: openingCredit,
        period_debit: periodDebit,
        period_credit: periodCredit,
        closing_debit: closingDebit,
        closing_credit: closingCredit,
      });
    }

    // 按科目编码排序
    details.sort((a, b) => a.account_code.localeCompare(b.account_code));

    // 计算合计
    let totalDebit = 0;
    let totalCredit = 0;
    for (const d of details) {
      totalDebit += d.closing_debit;
      totalCredit += d.closing_credit;
    }

    // 四舍五入避免浮点误差
    totalDebit = Math.round(totalDebit * 100) / 100;
    totalCredit = Math.round(totalCredit * 100) / 100;

    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

    return {
      details,
      total_debit: totalDebit,
      total_credit: totalCredit,
      is_balanced: isBalanced,
    };
  } catch (error) {
    throw new Error(`获取试算平衡表失败：${(error as Error).message}`);
  }
}

/**
 * 资产负债表
 * 注意：如果当期未做损益结转，损益类科目余额不会自动归零。
 * 因此需要在权益部分添加"本期未分配利润"= 当期净利润，使报表平衡。
 */
export async function getBalanceSheet(period: string) {
  try {
    const db = await getDB();
    const trialBalance = getTrialBalance(period);

    const assets: Array<{ name: string; amount: number }> = [];
    const liabilities: Array<{ name: string; amount: number }> = [];
    const equity: Array<{ name: string; amount: number }> = [];

    for (const item of trialBalance.details) {
      // 期末余额 = 借方余额 - 贷方余额（对于资产类）或 贷方余额 - 借方余额（对于负债/权益类）
      let balance = 0;
      if (item.direction === 'debit') {
        balance = item.closing_debit - item.closing_credit;
      } else {
        balance = item.closing_credit - item.closing_debit;
      }

      // 跳过余额为0的科目
      if (Math.abs(balance) < 0.01) continue;

      const entry = { name: item.account_name, amount: Math.round(balance * 100) / 100 };

      switch (item.category) {
        case 'asset':
          assets.push(entry);
          break;
        case 'liability':
          liabilities.push(entry);
          break;
        case 'equity':
          equity.push(entry);
          break;
        default:
          // 收入/费用/成本类科目不列入资产负债表（应已结转）
          break;
      }
    }

    // 计算当期净利润（收入 - 费用 - 成本）
    // 如果损益类科目在试算平衡表中仍有余额，说明未做损益结转
    let currentPeriodProfit = 0;
    for (const item of trialBalance.details) {
      if (item.category === 'revenue') {
        // 收入类：贷方余额为正
        currentPeriodProfit += item.closing_credit - item.closing_debit;
      } else if (item.category === 'expense' || item.category === 'cost') {
        // 费用/成本类：借方余额为正（减少利润）
        currentPeriodProfit -= item.closing_debit - item.closing_credit;
      }
    }
    currentPeriodProfit = Math.round(currentPeriodProfit * 100) / 100;

    // 如果存在未结转的当期利润，添加到权益部分
    if (Math.abs(currentPeriodProfit) >= 0.01) {
      equity.push({ name: '未分配利润（本期）', amount: currentPeriodProfit });
    }

    const totalAssets = assets.reduce((sum, a) => sum + a.amount, 0);
    const totalLiabilitiesEquity =
      liabilities.reduce((sum, l) => sum + l.amount, 0) +
      equity.reduce((sum, e) => sum + e.amount, 0);

    return {
      assets,
      liabilities,
      equity,
      total_assets: Math.round(totalAssets * 100) / 100,
      total_liabilities_equity: Math.round(totalLiabilitiesEquity * 100) / 100,
      is_balanced: Math.abs(totalAssets - totalLiabilitiesEquity) < 0.01,
    };
  } catch (error) {
    throw new Error(`获取资产负债表失败：${(error as Error).message}`);
  }
}

/**
 * 利润表
 */
export async function getIncomeStatement(period: string) {
  try {
    const db = await getDB();

    // 查询收入类科目（revenue）的贷方发生额
    const revenueRows = db.prepare(`
      SELECT
        a.code,
        a.name,
        COALESCE(SUM(e.credit_amount), 0) - COALESCE(SUM(e.debit_amount), 0) AS amount
      FROM voucher_entry e
      INNER JOIN voucher v ON e.voucher_id = v.id
      INNER JOIN account a ON e.account_code = a.code
      WHERE v.period = ? AND v.status = 'confirmed' AND a.category = 'revenue'
      GROUP BY e.account_code
      ORDER BY a.code
    `).all(period) as Array<{ code: string; name: string; amount: number }>;

    // 查询成本类科目（cost）的借方发生额
    const costRows = db.prepare(`
      SELECT
        a.code,
        a.name,
        COALESCE(SUM(e.debit_amount), 0) - COALESCE(SUM(e.credit_amount), 0) AS amount
      FROM voucher_entry e
      INNER JOIN voucher v ON e.voucher_id = v.id
      INNER JOIN account a ON e.account_code = a.code
      WHERE v.period = ? AND v.status = 'confirmed' AND a.category = 'cost'
      GROUP BY e.account_code
      ORDER BY a.code
    `).all(period) as Array<{ code: string; name: string; amount: number }>;

    // 查询费用类科目（expense）的借方发生额，区分营业费用和营业外支出
    const expenseRows = db.prepare(`
      SELECT
        a.code,
        a.name,
        a.code AS account_code,
        COALESCE(SUM(e.debit_amount), 0) - COALESCE(SUM(e.credit_amount), 0) AS amount
      FROM voucher_entry e
      INNER JOIN voucher v ON e.voucher_id = v.id
      INNER JOIN account a ON e.account_code = a.code
      WHERE v.period = ? AND v.status = 'confirmed' AND a.category = 'expense'
      GROUP BY e.account_code
      ORDER BY a.code
    `).all(period) as Array<{ code: string; name: string; account_code: string; amount: number }>;

    const revenues = revenueRows.map((r) => ({
      name: r.name,
      amount: Math.round(r.amount * 100) / 100,
    }));

    const costs = costRows.map((r) => ({
      name: r.name,
      amount: Math.round(r.amount * 100) / 100,
    }));

    const expenses = expenseRows.map((r) => ({
      name: r.name,
      amount: Math.round(r.amount * 100) / 100,
    }));

    const totalRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
    const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);

    // 区分营业费用和营业外支出
    const nonOperatingCodes = ['5711']; // 营业外支出
    const operatingExpenses = expenses.filter(
      (e) => !nonOperatingCodes.some((code) => expenseRows.find((r) => r.code === code && r.name === e.name))
    );
    const nonOperatingExpense = expenses.find((e) => e.name === '营业外支出');
    const nonOperatingRevenue = revenues.find((r) => r.name === '营业外收入');

    const totalOperatingExpense = operatingExpenses.reduce((sum, e) => sum + e.amount, 0);

    // 营业利润 = 收入合计 - 成本合计 - 营业费用合计
    const operatingProfit = totalRevenue - totalCost - totalOperatingExpense;

    // 利润总额 = 营业利润 + 营业外收入 - 营业外支出
    const nonOperatingIncome = nonOperatingRevenue ? nonOperatingRevenue.amount : 0;
    const nonOperatingExpenseAmount = nonOperatingExpense ? nonOperatingExpense.amount : 0;
    const totalProfit = operatingProfit + nonOperatingIncome - nonOperatingExpenseAmount;

    return {
      revenues,
      costs,
      expenses,
      operating_profit: Math.round(operatingProfit * 100) / 100,
      total_profit: Math.round(totalProfit * 100) / 100,
      period,
    };
  } catch (error) {
    throw new Error(`获取利润表失败：${(error as Error).message}`);
  }
}

/**
 * 明细账
 */
export async function getAccountLedger(accountCode: string, period: string) {
  try {
    const db = await getDB();

    // 查询科目名称
    const account = db.prepare('SELECT name FROM account WHERE code = ?').get(accountCode) as
      | { name: string }
      | undefined;

    if (!account) {
      throw new Error(`科目 ${accountCode} 不存在`);
    }

    // 查询期初余额
    const opening = db.prepare(
      'SELECT debit_amount, credit_amount FROM opening_balance WHERE account_code = ? AND period = ?'
    ).get(accountCode, period) as { debit_amount: number; credit_amount: number } | undefined;

    // 查询科目余额方向
    const accountInfo = db.prepare('SELECT balance_direction FROM account WHERE code = ?').get(accountCode) as
      | { balance_direction: string }
      | undefined;

    const direction = accountInfo?.balance_direction || 'debit';

    // 计算期初余额
    let balance = 0;
    if (opening) {
      if (direction === 'debit') {
        balance = opening.debit_amount - opening.credit_amount;
      } else {
        balance = opening.credit_amount - opening.debit_amount;
      }
    }

    // 查询该科目在该期间所有分录，按凭证日期排序
    const rows = db.prepare(`
      SELECT
        v.date,
        v.number AS voucher_number,
        e.summary,
        e.debit_amount AS debit,
        e.credit_amount AS credit
      FROM voucher_entry e
      INNER JOIN voucher v ON e.voucher_id = v.id
      WHERE e.account_code = ? AND v.period = ? AND v.status = 'confirmed'
      ORDER BY v.date, v.number, e.sort_order
    `).all(accountCode, period) as Array<{
      date: string;
      voucher_number: string;
      summary: string;
      debit: number;
      credit: number;
    }>;

    // 计算每笔后的余额
    const entries = rows.map((row) => {
      if (direction === 'debit') {
        balance = balance + row.debit - row.credit;
      } else {
        balance = balance + row.credit - row.debit;
      }

      return {
        date: row.date,
        voucher_number: row.voucher_number,
        summary: row.summary,
        debit: row.debit,
        credit: row.credit,
        balance: Math.round(balance * 100) / 100,
      };
    });

    return {
      account_code: accountCode,
      account_name: account.name,
      entries,
    };
  } catch (error) {
    throw new Error(`获取明细账失败：${(error as Error).message}`);
  }
}

// 记账模块 - 聊天集成服务
// 在对话中识别记账意图并返回结构化结果

import * as voucherService from './voucherService'
import * as reportService from './reportService'
import * as closingService from './closingService'
import * as accountService from './accountService'
import { getDB } from './database'

// 获取当前期间
function getCurrentPeriod(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

// 记账意图关键词映射
const intentPatterns: { pattern: RegExp; action: string }[] = [
  // 凭证相关
  { pattern: /查看.*凭证|凭证.*列表|本月.*凭证|有什么.*凭证/, action: 'list_vouchers' },
  { pattern: /新建.*凭证|录入.*凭证|添加.*凭证|做.*凭证|编制.*凭证/, action: 'create_voucher_hint' },
  // 报表相关
  { pattern: /资产负债表|资产.*负债/, action: 'balance_sheet' },
  { pattern: /利润表|损益表|经营.*成果/, action: 'income_statement' },
  { pattern: /试算平衡|试算.*平衡/, action: 'trial_balance' },
  { pattern: /科目.*余额|余额.*表/, action: 'trial_balance' },
  { pattern: /明细账|查询.*明细/, action: 'ledger_hint' },
  { pattern: /财务报表|生成.*报表|本月.*报表|看.*报表/, action: 'reports_hint' },
  // 科目相关
  { pattern: /科目.*列表|查看.*科目|有什么.*科目/, action: 'list_accounts' },
  // 期末处理
  { pattern: /月末.*处理|期末.*结转|结转.*损益|月末.*结账/, action: 'closing_hint' },
  { pattern: /结账|封账/, action: 'close_period' },
  { pattern: /反结账|打开.*期间/, action: 'reopen_hint' },
  // 税金
  { pattern: /税金.*计提|计提.*税|附加税/, action: 'tax_provision' },
  // 账套
  { pattern: /账套.*信息|账套.*设置|公司.*信息/, action: 'account_set_info' },
  // 通用记账入口
  { pattern: /记账|做账|账务|凭证/, action: 'accounting_entry' },
]

export async function handleAccountingIntent(message: string): Promise<string | null> {
  // 检查是否匹配任何记账意图
  let matchedAction: string | null = null
  for (const { pattern, action } of intentPatterns) {
    if (pattern.test(message)) {
      matchedAction = action
      break
    }
  }

  if (!matchedAction) return null

  const period = getCurrentPeriod()

  try {
    switch (matchedAction) {
      case 'list_vouchers':
        return await handleListVouchers(message, period)
      case 'create_voucher_hint':
        return handleCreateVoucherHint()
      case 'balance_sheet':
        return await handleBalanceSheet(period)
      case 'income_statement':
        return await handleIncomeStatement(period)
      case 'trial_balance':
        return await handleTrialBalance(period)
      case 'ledger_hint':
        return handleLedgerHint()
      case 'reports_hint':
        return handleReportsHint(period)
      case 'list_accounts':
        return await handleListAccounts(message)
      case 'closing_hint':
        return handleClosingHint(period)
      case 'close_period':
        return await handleClosePeriod(period)
      case 'reopen_hint':
        return handleReopenHint()
      case 'tax_provision':
        return await handleTaxProvision(period)
      case 'account_set_info':
        return await handleAccountSetInfo()
      case 'accounting_entry':
        return handleAccountingEntry()
      default:
        return null
    }
  } catch (error: any) {
    return `⚠️ 操作失败：${error.message || '未知错误'}\n\n您可以点击左侧「智能记账」进入管理面板进行操作。`
  }
}

// 格式化金额
function formatAmount(amount: number): string {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function handleListVouchers(message: string, period: string): Promise<string> {
  const result = await voucherService.getVouchers(period, undefined, 1, 20)
  const vouchers = result.vouchers || []

  if (vouchers.length === 0) {
    return `📊 ${period} 暂无凭证记录。\n\n您可以：\n• 点击左侧「智能记账」→「凭证管理」新建凭证\n• 上传发票自动生成凭证`
  }

  let text = `📊 ${period} 凭证列表（共 ${result.total} 张，显示前 20 张）\n\n`
  text += `| 编号 | 日期 | 摘要 | 借方 | 贷方 | 状态 |\n`
  text += `|------|------|------|------|------|------|\n`

  for (const v of vouchers) {
    const status = v.status === 'confirmed' ? '✅' : '📝'
    const debit = formatAmount(v.debit_total || 0)
    const credit = formatAmount(v.credit_total || 0)
    text += `| ${v.number} | ${v.date} | ${(v.summary || '').slice(0, 12)} | ${debit} | ${credit} | ${status} |\n`
  }

  text += `\n💡 点击左侧「智能记账」→「凭证管理」查看详情和新建凭证`
  return text
}

function handleCreateVoucherHint(): string {
  return `📝 新建凭证有以下方式：\n\n` +
    `1. **上传发票** — 在聊天中上传发票图片，AI 自动识别生成凭证\n` +
    `2. **手动录入** — 点击左侧「智能记账」→「凭证管理」→「新建凭证」\n` +
    `3. **导入银行流水** — 上传银行流水 Excel，自动生成凭证\n\n` +
    `💡 推荐方式：直接上传发票图片，AI 会自动识别金额、税额、对方单位并生成凭证草稿。`
}

async function handleBalanceSheet(period: string): Promise<string> {
  const report = await reportService.getBalanceSheet(period)

  let text = `📊 ${period} 资产负债表\n\n`
  text += `**资产**\n`
  for (const item of report.assets) {
    text += `• ${item.name}：¥${formatAmount(item.amount)}\n`
  }
  text += `**资产合计：¥${formatAmount(report.total_assets)}**\n\n`
  text += `**负债**\n`
  for (const item of report.liabilities) {
    text += `• ${item.name}：¥${formatAmount(item.amount)}\n`
  }
  text += `**所有者权益**\n`
  for (const item of report.equity) {
    text += `• ${item.name}：¥${formatAmount(item.amount)}\n`
  }
  text += `**负债和权益合计：¥${formatAmount(report.total_liabilities_equity)}**\n\n`

  if (report.is_balanced) {
    text += `✅ 资产 = 负债 + 所有者权益，报表平衡`
  } else {
    text += `⚠️ 报表不平衡，请检查凭证数据`
  }

  text += `\n\n💡 点击「智能记账」→「财务报表」查看完整报表和导出 Excel`
  return text
}

async function handleIncomeStatement(period: string): Promise<string> {
  const report = await reportService.getIncomeStatement(period)

  let text = `📊 ${period} 利润表\n\n`
  text += `**收入**\n`
  for (const item of report.revenues) {
    text += `• ${item.name}：¥${formatAmount(item.amount)}\n`
  }
  text += `**成本**\n`
  for (const item of report.costs) {
    text += `• ${item.name}：¥${formatAmount(item.amount)}\n`
  }
  text += `**费用**\n`
  for (const item of report.expenses) {
    text += `• ${item.name}：¥${formatAmount(item.amount)}\n`
  }
  text += `\n`
  text += `**营业利润：¥${formatAmount(report.operating_profit)}**\n`
  text += `**利润总额：¥${formatAmount(report.total_profit)}**\n\n`
  text += `💡 点击「智能记账」→「财务报表」查看完整报表和导出 Excel`
  return text
}

async function handleTrialBalance(period: string): Promise<string> {
  const report = await reportService.getTrialBalance(period)
  const details = report.details || []

  let text = `📊 ${period} 试算平衡表\n\n`
  text += `| 科目 | 期初借方 | 期初贷方 | 本期借方 | 本期贷方 | 期末借方 | 期末贷方 |\n`
  text += `|------|---------|---------|---------|---------|---------|---------|\n`

  // 只显示有发生额的科目
  const activeDetails = details.filter(d => d.period_debit > 0 || d.period_credit > 0 || d.opening_debit > 0 || d.opening_credit > 0)
  const displayDetails = activeDetails.slice(0, 30)

  for (const d of displayDetails) {
    text += `| ${d.account_code} ${d.account_name} | ${formatAmount(d.opening_debit)} | ${formatAmount(d.opening_credit)} | ${formatAmount(d.period_debit)} | ${formatAmount(d.period_credit)} | ${formatAmount(d.closing_debit)} | ${formatAmount(d.closing_credit)} |\n`
  }

  if (activeDetails.length > 30) {
    text += `\n... 还有 ${activeDetails.length - 30} 个科目\n`
  }

  text += `\n**借方合计：¥${formatAmount(report.total_debit)} | 贷方合计：¥${formatAmount(report.total_credit)}**\n`
  text += report.is_balanced ? '✅ 试算平衡' : '⚠️ 试算不平衡'
  text += `\n\n💡 点击「智能记账」→「财务报表」查看完整报表`
  return text
}

function handleLedgerHint(): string {
  return `📋 查询明细账需要指定科目。\n\n` +
    `您可以这样说：\n` +
    `• "查看银行存款明细账"\n` +
    `• "应收账款明细账"\n` +
    `• "管理费用本月明细"\n\n` +
    `或者点击左侧「智能记账」→「财务报表」选择科目查询。`
}

function handleReportsHint(period: string): string {
  return `📊 可用报表：\n\n` +
    `1. **试算平衡表** — 查看各科目借贷发生额和余额\n` +
    `2. **资产负债表** — 查看资产、负债、权益状况\n` +
    `3. **利润表** — 查看收入、成本、费用和利润\n\n` +
    `当前期间：${period}\n\n` +
    `您可以对我说：\n` +
    `• "查看资产负债表"\n` +
    `• "本月利润表"\n` +
    `• "试算平衡"\n\n` +
    `或者点击「智能记账」→「财务报表」查看全部报表。`
}

async function handleListAccounts(message: string): Promise<string> {
  // 尝试从消息中提取科目类别
  let category: string | undefined
  if (message.includes('资产') || message.includes('资产类')) category = 'asset'
  else if (message.includes('负债') || message.includes('负债类')) category = 'liability'
  else if (message.includes('权益') || message.includes('所有者权益')) category = 'equity'
  else if (message.includes('成本') || message.includes('成本类')) category = 'cost'
  else if (message.includes('收入') || message.includes('收入类')) category = 'revenue'
  else if (message.includes('费用') || message.includes('费用类')) category = 'expense'

  const accounts = await accountService.getAccounts(category)

  const categoryNames: Record<string, string> = {
    asset: '资产类', liability: '负债类', equity: '所有者权益类',
    cost: '成本类', revenue: '收入类', expense: '费用类'
  }

  let text = `📋 ${category ? categoryNames[category] + ' ' : ''}科目列表（共 ${accounts.length} 个）\n\n`

  let currentCategory = ''
  for (const a of accounts) {
    if (a.category !== currentCategory) {
      currentCategory = a.category
      text += `**【${categoryNames[currentCategory] || currentCategory}】**\n`
    }
    text += `• ${a.code} ${a.name}\n`
  }

  text += `\n💡 点击「智能记账」→「科目管理」查看详情和添加二级科目`
  return text
}

async function handleClosingHint(period: string): Promise<string> {
  const status = await closingService.getClosingStatus(period)
  const isClosed = status.status === 'closed'

  if (isClosed) {
    return `🔒 ${period} 已结账。\n\n` +
      `如需修改凭证，请联系管理员反结账。\n` +
      `点击「智能记账」→「期末处理」查看详情。`
  }

  return `📝 ${period} 期末处理步骤：\n\n` +
    `**Step 1** 税金计提 — 自动计算增值税及附加税\n` +
    `**Step 2** 损益结转 — 结转收入费用至本年利润\n` +
    `**Step 3** 试算平衡 — 校验借贷是否平衡\n` +
    `**Step 4** 期末结账 — 锁定本月数据\n\n` +
    `您可以直接对我说：\n` +
    `• "计提本月税金"\n` +
    `• "结转损益"\n` +
    `• "结账"\n\n` +
    `或点击「智能记账」→「期末处理」一键完成。`
}

async function handleClosePeriod(period: string): Promise<string> {
  const status = await closingService.getClosingStatus(period)
  if (status.status === 'closed') {
    return `🔒 ${period} 已经结账，无需重复操作。\n\n如需修改，请联系管理员反结账。`
  }

  return `⚠️ 结账是重要操作，结账后本月凭证将被锁定。\n\n` +
    `请确认已完成以下步骤：\n` +
    `1. ✅ 所有凭证已录入并审核\n` +
    `2. ✅ 税金已计提\n` +
    `3. ✅ 损益已结转\n` +
    `4. ✅ 试算平衡\n\n` +
    `请点击「智能记账」→「期末处理」→「确认结账」完成操作。`
}

function handleReopenHint(): string {
  return `⚠️ 反结账需要管理员权限，且会解锁已结账期间的数据。\n\n` +
    `请联系管理员在「智能记账」→「期末处理」中执行反结账操作。`
}

async function handleTaxProvision(period: string): Promise<string> {
  // 获取账套信息判断纳税人类型
  const db = await getDB()
  const accountSet = db.prepare('SELECT taxpayer_type FROM account_set LIMIT 1').get() as any
  const taxpayerType = accountSet?.taxpayer_type || 'general'

  const voucher = await closingService.generateTaxProvision(period, taxpayerType)

  if (!voucher || !voucher.entries || voucher.entries.length === 0) {
    return `ℹ️ ${period} 无需计提税金（可能没有应税数据）。\n\n` +
      `请先确认本月已录入销项和进项发票凭证。`
  }

  let text = `💰 ${period} 税金计提凭证预览\n\n`
  text += `**凭证编号：** ${voucher.number}\n`
  text += `**摘要：** ${voucher.summary}\n\n`
  text += `| 科目 | 借方 | 贷方 |\n`
  text += `|------|------|------|\n`

  for (const entry of voucher.entries) {
    const debit = entry.debit_amount > 0 ? formatAmount(entry.debit_amount) : ''
    const credit = entry.credit_amount > 0 ? formatAmount(entry.credit_amount) : ''
    text += `| ${entry.account_code} ${entry.summary || ''} | ${debit} | ${credit} |\n`
  }

  text += `\n💡 确认无误后，点击「智能记账」→「期末处理」→「生成凭证」写入数据库。`
  return text
}

async function handleAccountSetInfo(): Promise<string> {
  const db = await getDB()
  const accountSet = db.prepare('SELECT * FROM account_set LIMIT 1').get() as any

  if (!accountSet) {
    return `📋 尚未创建账套。\n\n` +
      `请点击「智能记账」→「账套设置」创建企业账套，配置：\n` +
      `• 企业名称\n` +
      `• 会计准则（小企业/企业）\n` +
      `• 纳税人类型（一般纳税人/小规模）\n` +
      `• 启用期间`
  }

  const standardNames: Record<string, string> = { small: '小企业会计准则', enterprise: '企业会计准则' }
  const taxpayerNames: Record<string, string> = { general: '一般纳税人', small_scale: '小规模纳税人' }

  return `📋 账套信息\n\n` +
    `• **企业名称：** ${accountSet.company_name}\n` +
    `• **会计准则：** ${standardNames[accountSet.accounting_standard] || accountSet.accounting_standard}\n` +
    `• **纳税人类型：** ${taxpayerNames[accountSet.taxpayer_type] || accountSet.taxpayer_type}\n` +
    `• **启用期间：** ${accountSet.start_period}\n` +
    `• **当前期间：** ${accountSet.current_period}\n` +
    `• **创建时间：** ${accountSet.created_at}\n\n` +
    `💡 点击「智能记账」→「账套设置」修改配置。`
}

function handleAccountingEntry(): string {
  return `📒 智能记账功能\n\n` +
    `我可以帮您完成以下操作：\n\n` +
    `**凭证管理**\n` +
    `• "查看本月凭证" — 查看凭证列表\n` +
    `• "新建凭证" — 手动录入凭证\n` +
    `• 上传发票图片 — AI 自动识别生成凭证\n\n` +
    `**财务报表**\n` +
    `• "资产负债表" — 查看资产状况\n` +
    `• "利润表" — 查看经营成果\n` +
    `• "试算平衡" — 校验借贷平衡\n\n` +
    `**期末处理**\n` +
    `• "计提税金" — 自动计算税费\n` +
    `• "结转损益" — 结转收入费用\n` +
    `• "结账" — 锁定本月数据\n\n` +
    `**其他**\n` +
    `• "查看科目" — 查看会计科目\n` +
    `• "账套信息" — 查看企业配置\n\n` +
    `💡 您也可以点击左侧「智能记账」进入管理面板进行详细操作。`
}

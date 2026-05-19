import { NextRequest, NextResponse } from 'next/server'
import { getDB, addLog, backupDB } from '../../../../src/services/accounting/database'
import { logger } from '../../../../src/lib/logger';

// GET - 获取账套信息
export async function GET() {
  try {
    const db = await getDB()
    const accountSet = db.prepare('SELECT * FROM account_set LIMIT 1').get()

    if (!accountSet) {
      return NextResponse.json({ exists: false })
    }

    return NextResponse.json({ exists: true, account_set: accountSet })
  } catch (error) {
    logger.error('SYSTEM', '获取账套信息失败', { extra: { error: String(error) } })
    return NextResponse.json(
      { error: '获取账套信息失败' },
      { status: 500 }
    )
  }
}

// POST - 创建/更新账套
export async function POST(request: NextRequest) {
  try {
    const { company_name, accounting_standard, taxpayer_type, start_period } = await request.json()

    if (!company_name || !accounting_standard || !taxpayer_type || !start_period) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      )
    }

    if (!['small', 'enterprise'].includes(accounting_standard)) {
      return NextResponse.json(
        { error: '会计准则参数无效，应为 small 或 enterprise' },
        { status: 400 }
      )
    }

    if (!['general', 'small_scale'].includes(taxpayer_type)) {
      return NextResponse.json(
        { error: '纳税人类型参数无效，应为 general 或 small_scale' },
        { status: 400 }
      )
    }

    const db = await getDB()

    // 检查是否存在账套
    const existing = db.prepare('SELECT id FROM account_set LIMIT 1').get()

    if (existing) {
      // 更新已有账套
      db.prepare(`
        UPDATE account_set
        SET company_name = ?, accounting_standard = ?, taxpayer_type = ?, start_period = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(company_name, accounting_standard, taxpayer_type, start_period, existing.id)
    } else {
      // 创建新账套
      db.prepare(`
        INSERT INTO account_set (id, company_name, accounting_standard, taxpayer_type, currency, start_period, current_period, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'CNY', ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
      `).run('set_' + Date.now(), company_name, accounting_standard, taxpayer_type, start_period, start_period)
    }

    // 自动创建备份
    try { backupDB() } catch (e) { logger.warn('SYSTEM', '备份失败', { extra: { error: String(e) } }) }

    // 添加操作日志
    try { addLog('system', existing ? 'update_account_set' : 'create_account_set', 'account_set', '', `账套: ${company_name}`) } catch (e) { logger.warn('SYSTEM', '日志失败', { extra: { error: String(e) } }) }

    const accountSet = db.prepare('SELECT * FROM account_set LIMIT 1').get()

    return NextResponse.json({ success: true, account_set: accountSet })
  } catch (error) {
    logger.error('SYSTEM', '创建/更新账套失败', { extra: { error: String(error) } })
    return NextResponse.json(
      { error: '创建/更新账套失败' },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
import * as reportService from '../../../../src/services/accounting/reportService'
import { logger } from '../../../../src/lib/logger';

/**
 * GET /api/accounting/reports
 * 根据 type 参数返回不同报表
 *
 * 支持的报表类型:
 * - trial_balance: 试算平衡表
 * - balance_sheet: 资产负债表
 * - income_statement: 利润表
 * - ledger: 明细账
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const period = searchParams.get('period')
    const accountCode = searchParams.get('account_code')

    if (!type) {
      return NextResponse.json(
        { error: '缺少必要参数: type' },
        { status: 400 }
      )
    }

    if (!period) {
      return NextResponse.json(
        { error: '缺少必要参数: period' },
        { status: 400 }
      )
    }

    let result: any

    switch (type) {
      case 'trial_balance':
        result = await reportService.getTrialBalance(period)
        break

      case 'balance_sheet':
        result = await reportService.getBalanceSheet(period)
        break

      case 'income_statement':
        result = await reportService.getIncomeStatement(period)
        break

      case 'ledger':
        if (!accountCode) {
          return NextResponse.json(
            { error: 'ledger 类型需要 account_code 参数' },
            { status: 400 }
          )
        }
        result = await reportService.getAccountLedger(accountCode, period)
        break

      default:
        return NextResponse.json(
          { error: `不支持的报表类型: ${type}` },
          { status: 400 }
        )
    }

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '获取报表失败' },
      { status: 500 }
    )
  }
}

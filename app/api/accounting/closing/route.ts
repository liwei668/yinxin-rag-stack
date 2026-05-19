import { NextResponse } from 'next/server'
import * as closingService from '../../../../src/services/accounting/closingService'
import * as voucherService from '../../../../src/services/accounting/voucherService'
import { logger } from '../../../../src/lib/logger';

/**
 * GET /api/accounting/closing
 * 获取结账状态
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period')

    if (!period) {
      return NextResponse.json(
        { error: '缺少必要参数: period' },
        { status: 400 }
      )
    }

    const status = await closingService.getClosingStatus(period)

    return NextResponse.json(status)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '获取结账状态失败' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/accounting/closing
 * 根据 action 执行不同结账操作
 *
 * 支持的操作:
 * - close: 结账
 * - reopen: 反结账
 * - tax_provision: 生成计提税费凭证（预览，不写入）
 * - profit_transfer: 生成结转损益凭证（预览，不写入）
 * - confirm_tax: 将计提税费凭证写入数据库
 * - confirm_profit: 将结转损益凭证写入数据库
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, period, operator, taxpayerType } = body

    if (!action || !period) {
      return NextResponse.json(
        { error: '缺少必要参数: action, period' },
        { status: 400 }
      )
    }

    switch (action) {
      case 'close': {
        if (!operator) {
          return NextResponse.json(
            { error: 'close 操作需要 operator 参数' },
            { status: 400 }
          )
        }
        await closingService.closePeriod(period, operator)
        const status = await closingService.getClosingStatus(period)
        return NextResponse.json(status)
      }

      case 'reopen': {
        if (!operator) {
          return NextResponse.json(
            { error: 'reopen 操作需要 operator 参数' },
            { status: 400 }
          )
        }
        await closingService.reopenPeriod(period, operator)
        const status = await closingService.getClosingStatus(period)
        return NextResponse.json(status)
      }

      case 'tax_provision': {
        const voucherData = await closingService.generateTaxProvision(
          period,
          taxpayerType
        )
        return NextResponse.json({ preview: voucherData })
      }

      case 'profit_transfer': {
        const voucherData = await closingService.generateProfitTransfer(period)
        return NextResponse.json({ preview: voucherData })
      }

      case 'confirm_tax': {
        const voucherData = await closingService.generateTaxProvision(
          period,
          taxpayerType
        )
        if (!voucherData.voucher) {
          return NextResponse.json({ error: voucherData.message || '无需计提税金' }, { status: 400 })
        }
        const v = voucherData.voucher
        const voucher = await voucherService.createVoucher({
          date: v.date,
          period: v.period,
          summary: v.summary,
          entries: v.entries,
          source: v.source,
          created_by: operator,
        })
        return NextResponse.json(voucher)
      }

      case 'confirm_profit': {
        const voucherData = await closingService.generateProfitTransfer(period)
        if (!voucherData.voucher) {
          return NextResponse.json({ error: voucherData.message || '无需结转损益' }, { status: 400 })
        }
        const v = voucherData.voucher
        const voucher = await voucherService.createVoucher({
          date: v.date,
          period: v.period,
          summary: v.summary,
          entries: v.entries,
          source: v.source,
          created_by: operator,
        })
        return NextResponse.json(voucher)
      }

      default:
        return NextResponse.json(
          { error: `不支持的操作: ${action}` },
          { status: 400 }
        )
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '结账操作失败' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import * as accountService from '../../../../src/services/accounting/accountService'
import { logger } from '../../../../src/lib/logger';

// GET - 获取期初余额
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period')

    if (!period) {
      return NextResponse.json(
        { error: '缺少 period 参数' },
        { status: 400 }
      )
    }

    const balances = await accountService.getOpeningBalances(period)

    return NextResponse.json({ success: true, balances })
  } catch (error) {
    logger.error('SYSTEM', '获取期初余额失败', { extra: { error: String(error) } })
    return NextResponse.json(
      { error: '获取期初余额失败' },
      { status: 500 }
    )
  }
}

// POST - 保存期初余额
export async function POST(request: NextRequest) {
  try {
    const { period, balances } = await request.json()

    if (!period || !balances || !Array.isArray(balances)) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      )
    }

    await accountService.saveOpeningBalances(period, balances)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('SYSTEM', '保存期初余额失败', { extra: { error: String(error) } })
    return NextResponse.json(
      { error: error.message || '保存期初余额失败' },
      { status: 500 }
    )
  }
}

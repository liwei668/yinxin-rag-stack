import { NextResponse } from 'next/server'
import * as voucherService from '../../../../src/services/accounting/voucherService'
import { logger } from '../../../../src/lib/logger';

/**
 * GET /api/accounting/vouchers
 * 查询凭证列表
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || undefined
    const status = searchParams.get('status') || undefined
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10)

    const result = await voucherService.getVouchers(period, status, page, pageSize)

    return NextResponse.json({
      vouchers: result.list,
      total: result.total,
      page,
      pageSize,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '查询凭证列表失败' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/accounting/vouchers
 * 创建凭证
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { date, period, summary, entries, source, created_by } = body

    if (!date || !period || !summary || !entries || !Array.isArray(entries)) {
      return NextResponse.json(
        { error: '缺少必要参数: date, period, summary, entries' },
        { status: 400 }
      )
    }

    const voucher = await voucherService.createVoucher({
      date,
      period,
      summary,
      entries,
      source,
      created_by
    })

    return NextResponse.json(voucher, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '创建凭证失败' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/accounting/vouchers
 * 更新凭证
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, date, summary, entries } = body

    if (!id) {
      return NextResponse.json(
        { error: '缺少必要参数: id' },
        { status: 400 }
      )
    }

    const voucher = await voucherService.updateVoucher(id, {
      date,
      summary,
      entries,
    })

    return NextResponse.json(voucher)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '更新凭证失败' },
      { status: 500 }
    )
  }
}

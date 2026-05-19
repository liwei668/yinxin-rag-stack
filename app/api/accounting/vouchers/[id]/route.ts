import { NextResponse } from 'next/server'
import * as voucherService from '../../../../../src/services/accounting/voucherService'
import { logger } from '../../../../../src/lib/logger';

/**
 * GET /api/accounting/vouchers/[id]
 * 获取单个凭证
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const voucher = await voucherService.getVoucher(id)

    if (!voucher) {
      return NextResponse.json(
        { error: '凭证不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json(voucher)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '获取凭证失败' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/accounting/vouchers/[id]
 * 删除凭证
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await voucherService.deleteVoucher(id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '删除凭证失败' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/accounting/vouchers/[id]
 * 审核凭证
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { operator } = body

    if (!operator) {
      return NextResponse.json(
        { error: '缺少必要参数: operator' },
        { status: 400 }
      )
    }

    const voucher = await voucherService.confirmVoucher(id, operator)

    return NextResponse.json(voucher)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '审核凭证失败' },
      { status: 500 }
    )
  }
}

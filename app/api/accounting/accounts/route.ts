import { NextRequest, NextResponse } from 'next/server'
import * as accountService from '../../../../src/services/accounting/accountService'
import { logger } from '../../../../src/lib/logger';

// GET - 获取科目列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || undefined

    const accounts = await accountService.getAccounts(category)

    return NextResponse.json({ success: true, accounts })
  } catch (error) {
    logger.error('SYSTEM', '获取科目列表失败', { extra: { error: String(error) } })
    return NextResponse.json(
      { error: '获取科目列表失败' },
      { status: 500 }
    )
  }
}

// POST - 创建二级科目
export async function POST(request: NextRequest) {
  try {
    const { code, name, parent_code, category, direction } = await request.json()

    if (!code || !name || !parent_code || !category || !direction) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      )
    }

    const account = await accountService.createAccount(code, name, parent_code, category, direction)

    return NextResponse.json({ success: true, account })
  } catch (error: any) {
    logger.error('SYSTEM', '创建科目失败', { extra: { error: String(error) } })
    return NextResponse.json(
      { error: error.message || '创建科目失败' },
      { status: 500 }
    )
  }
}

// PUT - 修改科目
export async function PUT(request: NextRequest) {
  try {
    const { code, name } = await request.json()

    if (!code || !name) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      )
    }

    await accountService.updateAccount(code, name)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('SYSTEM', '修改科目失败', { extra: { error: String(error) } })
    return NextResponse.json(
      { error: error.message || '修改科目失败' },
      { status: 500 }
    )
  }
}

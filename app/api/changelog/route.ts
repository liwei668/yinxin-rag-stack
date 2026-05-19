import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { logger } from '../../../src/lib/logger';

const CHANGELOG_PATH = path.join(process.cwd(), 'data', 'changelog.json')
const VERSION_PATH = path.join(process.cwd(), 'data', 'version.json')

// 读取更新日志
export async function GET() {
  try {
    if (!fs.existsSync(CHANGELOG_PATH)) {
      return NextResponse.json([])
    }
    const data = fs.readFileSync(CHANGELOG_PATH, 'utf-8')
    const changelog = JSON.parse(data)
    return NextResponse.json(changelog)
  } catch (error) {
    logger.error('SYSTEM', '读取更新日志失败', { extra: { error: String(error) } })
    return NextResponse.json({ error: '读取更新日志失败' }, { status: 500 })
  }
}

// 添加更新日志
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { version, date, product, changes } = body

    if (!version || !changes || !Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json({ error: '参数不完整，需要 version 和 changes' }, { status: 400 })
    }

    // 读取现有日志
    let changelog: any[] = []
    if (fs.existsSync(CHANGELOG_PATH)) {
      const data = fs.readFileSync(CHANGELOG_PATH, 'utf-8')
      changelog = JSON.parse(data)
    }

    const today = date || new Date().toISOString().split('T')[0]

    // 检查是否已存在相同版本
    const existingIndex = changelog.findIndex((log: any) => log.version === version)

    if (existingIndex >= 0) {
      // 合并到已有版本的 changes 中（去重）
      const existingChanges = changelog[existingIndex].changes
      const newChanges = changes.filter((c: string) => !existingChanges.includes(c))
      changelog[existingIndex].changes = [...newChanges, ...existingChanges]
      changelog[existingIndex].date = today
      if (product) changelog[existingIndex].product = product
    } else {
      // 添加新版本到顶部
      changelog.unshift({
        version,
        date: today,
        product: product || 'AGI.ai',
        changes
      })
    }

    // 写入日志文件
    fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2), 'utf-8')

    // 同步更新 version.json（取最新版本号）
    syncVersion(changelog[0])

    return NextResponse.json({ success: true, changelog })
  } catch (error) {
    logger.error('SYSTEM', '添加更新日志失败', { extra: { error: String(error) } })
    return NextResponse.json({ error: '添加更新日志失败' }, { status: 500 })
  }
}

// 编辑更新日志
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { index, version, date, product, changes } = body

    if (index === undefined || index < 0) {
      return NextResponse.json({ error: '需要指定要编辑的日志索引' }, { status: 400 })
    }

    let changelog: any[] = []
    if (fs.existsSync(CHANGELOG_PATH)) {
      const data = fs.readFileSync(CHANGELOG_PATH, 'utf-8')
      changelog = JSON.parse(data)
    }

    if (index >= changelog.length) {
      return NextResponse.json({ error: '日志索引超出范围' }, { status: 400 })
    }

    // 更新字段
    if (version !== undefined) changelog[index].version = version
    if (date !== undefined) changelog[index].date = date
    if (product !== undefined) changelog[index].product = product
    if (changes !== undefined) changelog[index].changes = changes

    fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2), 'utf-8')

    // 如果编辑的是第一条（最新版本），同步 version.json
    if (index === 0) {
      syncVersion(changelog[0])
    }

    return NextResponse.json({ success: true, changelog })
  } catch (error) {
    logger.error('SYSTEM', '编辑更新日志失败', { extra: { error: String(error) } })
    return NextResponse.json({ error: '编辑更新日志失败' }, { status: 500 })
  }
}

// 删除更新日志
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const index = parseInt(searchParams.get('index') || '0')

    let changelog: any[] = []
    if (fs.existsSync(CHANGELOG_PATH)) {
      const data = fs.readFileSync(CHANGELOG_PATH, 'utf-8')
      changelog = JSON.parse(data)
    }

    if (index < 0 || index >= changelog.length) {
      return NextResponse.json({ error: '日志索引超出范围' }, { status: 400 })
    }

    changelog.splice(index, 1)
    fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2), 'utf-8')

    // 同步 version.json（取最新版本号）
    if (changelog.length > 0) {
      syncVersion(changelog[0])
    }

    return NextResponse.json({ success: true, changelog })
  } catch (error) {
    logger.error('SYSTEM', '删除更新日志失败', { extra: { error: String(error) } })
    return NextResponse.json({ error: '删除更新日志失败' }, { status: 500 })
  }
}

// 同步版本号到 version.json
function syncVersion(latest: { version: string; date: string; product?: string }) {
  try {
    const versionData = {
      version: latest.version,
      date: latest.date,
      productName: latest.product || 'AGI.ai',
    }
    fs.writeFileSync(VERSION_PATH, JSON.stringify(versionData, null, 2), 'utf-8')
  } catch (error) {
    logger.error('SYSTEM', '同步版本号失败', { extra: { error: String(error) } })
  }
}

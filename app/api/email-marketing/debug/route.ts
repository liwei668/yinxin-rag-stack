import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../src/services/email-marketing/database'
import path from 'path'
import fs from 'fs'

const DB_DIR = path.join(process.cwd(), 'data', 'email-marketing');
const DB_PATH = path.join(DB_DIR, 'email-marketing.db');

// GET - 调试API，查看数据库中的所有配置
export async function GET(request: NextRequest) {
  try {
    const db = await getDB()
    
    // 查询所有配置
    const allConfigs = db.prepare('SELECT * FROM email_config ORDER BY created_at DESC').all()
    
    // 查询数据库文件信息
    const dbExists = fs.existsSync(DB_PATH)
    const dbStat = dbExists ? fs.statSync(DB_PATH) : null
    
    return NextResponse.json({
      success: true,
      debug: {
        database_path: DB_PATH,
        database_exists: dbExists,
        database_size: dbStat ? `${(dbStat.size / 1024).toFixed(2)} KB` : null,
        config_count: allConfigs.length,
        configs: allConfigs.map((c: any) => ({
          id: c.id,
          email_address: c.email_address,
          is_active: !!c.is_active,
          created_at: c.created_at
        }))
      }
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}

// DELETE - 清理所有配置（用于调试）
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const confirm = searchParams.get('confirm')
    
    if (confirm !== 'yes') {
      return NextResponse.json(
        { error: '请添加 ?confirm=yes 参数确认删除' },
        { status: 400 }
      )
    }
    
    const db = await getDB()
    const result = db.prepare('DELETE FROM email_config').run()
    
    return NextResponse.json({
      success: true,
      message: `已删除 ${result.changes} 条配置记录`
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}

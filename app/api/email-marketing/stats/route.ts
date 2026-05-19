import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '../../../../src/services/email-marketing/database'

// GET - 获取统计数据
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const config_id = searchParams.get('config_id')

    const db = await getDB()

    // 今日发送数
    let todaySent = { count: 0 }
    try {
      let sql = "SELECT COUNT(*) as count FROM sent_email WHERE DATE(sent_at) = DATE('now', 'localtime')"
      if (config_id) {
        sql += ' AND config_id = ?'
        todaySent = db.prepare(sql).get(config_id) as { count: number }
      } else {
        todaySent = db.prepare(sql).get() as { count: number }
      }
    } catch (e) {
      console.error('今日发送数查询失败:', e)
    }

    // 今日回复数
    let todayReceived = { count: 0 }
    try {
      let sql = "SELECT COUNT(*) as count FROM received_email WHERE DATE(received_at) = DATE('now', 'localtime')"
      if (config_id) {
        sql += ' AND config_id = ?'
        todayReceived = db.prepare(sql).get(config_id) as { count: number }
      } else {
        todayReceived = db.prepare(sql).get() as { count: number }
      }
    } catch (e) {
      console.error('今日回复数查询失败:', e)
    }

    // 待处理数
    let unreadCount = { count: 0 }
    try {
      let sql = 'SELECT COUNT(*) as count FROM received_email WHERE is_read = 0 AND is_spam = 0'
      if (config_id) {
        sql += ' AND config_id = ?'
        unreadCount = db.prepare(sql).get(config_id) as { count: number }
      } else {
        unreadCount = db.prepare(sql).get() as { count: number }
      }
    } catch (e) {
      console.error('待处理数查询失败:', e)
    }

    // 拓客线索数
    let leadCount = { count: 0 }
    try {
      leadCount = db.prepare('SELECT COUNT(*) as count FROM contact WHERE is_lead = 1').get() as { count: number }
    } catch (e) {
      console.error('线索数查询失败:', e)
    }

    // 垃圾邮件统计
    let spamCount = { count: 0 }
    try {
      let sql = 'SELECT COUNT(*) as count FROM received_email WHERE is_spam = 1'
      if (config_id) {
        sql += ' AND config_id = ?'
        spamCount = db.prepare(sql).get(config_id) as { count: number }
      } else {
        spamCount = db.prepare(sql).get() as { count: number }
      }
    } catch (e) {
      console.error('垃圾邮件统计查询失败:', e)
    }

    // 发送成功率
    let sentSuccessRate = 0
    let sentTotal = 0
    try {
      let sql = "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as success FROM sent_email"
      if (config_id) {
        sql += ' WHERE config_id = ?'
        const sentStats = db.prepare(sql).get(config_id) as { total: number, success: number }
        sentTotal = sentStats?.total || 0
        if (sentTotal > 0) {
          sentSuccessRate = Math.round(((sentStats?.success || 0) / sentTotal) * 100)
        }
      } else {
        const sentStats = db.prepare(sql).get() as { total: number, success: number }
        sentTotal = sentStats?.total || 0
        if (sentTotal > 0) {
          sentSuccessRate = Math.round(((sentStats?.success || 0) / sentTotal) * 100)
        }
      }
    } catch (e) {
      console.error('发送成功率查询失败:', e)
    }

    // 最近发送的邮件（简化查询）
    let recentSent: any[] = []
    try {
      let sql = 'SELECT subject, to_address as detail, sent_at as time FROM sent_email WHERE sent_at IS NOT NULL'
      if (config_id) {
        sql += ' AND config_id = ?'
        sql += ' ORDER BY sent_at DESC LIMIT 5'
        recentSent = db.prepare(sql).all(config_id)
      } else {
        sql += ' ORDER BY sent_at DESC LIMIT 5'
        recentSent = db.prepare(sql).all()
      }
      recentSent = recentSent.map((r: any) => ({ type: 'sent', ...r }))
    } catch (e) {
      console.error('最近发送查询失败:', e)
    }

    // 最近接收的邮件（简化查询）
    let recentReceived: any[] = []
    try {
      let sql = 'SELECT subject, from_address as detail, received_at as time FROM received_email'
      if (config_id) {
        sql += ' WHERE config_id = ?'
        sql += ' ORDER BY received_at DESC LIMIT 5'
        recentReceived = db.prepare(sql).all(config_id)
      } else {
        sql += ' ORDER BY received_at DESC LIMIT 5'
        recentReceived = db.prepare(sql).all()
      }
      recentReceived = recentReceived.map((r: any) => ({ type: 'received', ...r }))
    } catch (e) {
      console.error('最近接收查询失败:', e)
    }

    // 合并最近活动
    const recentActivity = [...recentSent, ...recentReceived]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 10)

    return NextResponse.json({
      success: true,
      stats: {
        todaySent: todaySent?.count || 0,
        todayReceived: todayReceived?.count || 0,
        unreadCount: unreadCount?.count || 0,
        leadCount: leadCount?.count || 0,
        spamCount: spamCount?.count || 0,
        sentSuccessRate,
        sentTotal,
        recentActivity
      }
    })
  } catch (error: any) {
    console.error('获取统计数据失败:', error)
    return NextResponse.json(
      { error: '获取统计数据失败', details: error.message },
      { status: 500 }
    )
  }
}

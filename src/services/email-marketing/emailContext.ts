// 邮件对话上下文管理服务
// 识别和管理同一发件人的多封邮件对话
import { getDB } from './database'

// 上下文接口
export interface EmailContext {
  email_address: string
  company_name?: string
  first_contact_at?: string
  last_contact_at?: string
  message_count: number
  summary?: string
  key_points: string  // JSON字符串
  current_stage?: string
  created_at?: string
  updated_at?: string
}

// 初始化上下文表
export async function initContextTable(): Promise<void> {
  const db = await getDB()
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_conversation_context (
      email_address TEXT PRIMARY KEY,
      company_name TEXT,
      first_contact_at TEXT,
      last_contact_at TEXT,
      message_count INTEGER DEFAULT 1,
      summary TEXT,
      key_points TEXT DEFAULT '[]',
      current_stage TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)
  
  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_email_address 
    ON email_conversation_context(email_address)
  `)
  
  console.log('✅ 邮件上下文表初始化成功')
}

// 获取邮件上下文
export async function getEmailContext(emailAddress: string): Promise<EmailContext | null> {
  const db = await getDB()
  
  const context = db.prepare(`
    SELECT * FROM email_conversation_context 
    WHERE email_address = ?
  `).get(emailAddress) as EmailContext | undefined
  
  if (context) {
    console.log(`✅ 找到上下文: ${emailAddress}, 邮件数: ${context.message_count}`)
  }
  
  return context || null
}

// 创建或更新上下文
export async function updateEmailContext(
  emailAddress: string,
  newEmail: {
    subject: string
    content: string
    fromName?: string
  }
): Promise<void> {
  const db = await getDB()
  
  const existing = await getEmailContext(emailAddress)
  
  if (existing) {
    // 更新现有上下文
    const now = new Date().toISOString()
    const newMessageCount = existing.message_count + 1
    
    // 提取新的关键信息
    const keyPoints = JSON.parse(existing.key_points || '[]')
    const newKeyPoint = extractKeyPoints(newEmail.subject, newEmail.content)
    keyPoints.push({
      type: newKeyPoint.type,
      value: newKeyPoint.value,
      timestamp: now
    })
    
    // 保留最近10个关键点
    const recentKeyPoints = keyPoints.slice(-10)
    
    // 更新摘要
    const newSummary = updateSummary(existing.summary || '', newEmail.subject, newEmail.content)
    
    db.prepare(`
      UPDATE email_conversation_context
      SET 
        message_count = ?,
        last_contact_at = ?,
        key_points = ?,
        summary = ?,
        current_stage = ?,
        updated_at = datetime('now', 'localtime')
      WHERE email_address = ?
    `).run(
      newMessageCount,
      now,
      JSON.stringify(recentKeyPoints),
      newSummary,
      determineStage(newEmail.subject, newEmail.content),
      emailAddress
    )
    
    console.log(`✅ 更新上下文: ${emailAddress}, 邮件数: ${newMessageCount}`)
  } else {
    // 创建新上下文
    const now = new Date().toISOString()
    const keyPoint = extractKeyPoints(newEmail.subject, newEmail.content)
    
    db.prepare(`
      INSERT INTO email_conversation_context
      (email_address, company_name, first_contact_at, last_contact_at, 
       message_count, summary, key_points, current_stage, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(
      emailAddress,
      newEmail.fromName || null,
      now,
      now,
      1,
      `首次联系: ${newEmail.subject}`,
      JSON.stringify([{
        type: keyPoint.type,
        value: keyPoint.value,
        timestamp: now
      }]),
      determineStage(newEmail.subject, newEmail.content)
    )
    
    console.log(`✅ 创建新上下文: ${emailAddress}`)
  }
}

// 提取关键信息
function extractKeyPoints(subject: string, content: string): { type: string; value: string } {
  const text = `${subject} ${content}`.toLowerCase()
  
  // 检测意图类型
  if (text.includes('价格') || text.includes('报价') || text.includes('多少钱')) {
    return { type: 'quotation', value: '询问价格/报价' }
  } else if (text.includes('合作') || text.includes('代理') || text.includes('加盟')) {
    return { type: 'cooperation', value: '商务合作意向' }
  } else if (text.includes('产品') || text.includes('什么') || text.includes('介绍')) {
    return { type: 'product_inquiry', value: '产品咨询' }
  } else if (text.includes('技术') || text.includes('支持') || text.includes('帮助')) {
    return { type: 'support', value: '技术支持请求' }
  } else if (text.includes('投诉') || text.includes('问题') || text.includes('故障')) {
    return { type: 'complaint', value: '投诉/问题反馈' }
  } else if (text.includes('付款') || text.includes('支付') || text.includes('发票')) {
    return { type: 'payment', value: '付款相关' }
  } else if (text.includes('你好') || text.includes('您好') || text.includes('hi') || text.includes('hello')) {
    return { type: 'greeting', value: '问候' }
  } else {
    return { type: 'general', value: '一般咨询' }
  }
}

// 更新对话摘要
function updateSummary(existingSummary: string, subject: string, content: string): string {
  const newPoint = `【${new Date().toLocaleString('zh-CN')}】${subject}: ${content.substring(0, 50)}...`
  
  // 保留最近3个摘要点
  const points = existingSummary ? existingSummary.split('\n').filter(Boolean) : []
  points.push(newPoint)
  
  if (points.length > 3) {
    return points.slice(-3).join('\n')
  }
  
  return points.join('\n')
}

// 确定当前阶段
function determineStage(subject: string, content: string): string {
  const text = `${subject} ${content}`.toLowerCase()
  
  if (text.includes('合同') || text.includes('签约')) {
    return 'contract'
  } else if (text.includes('付款') || text.includes('支付') || text.includes('报价')) {
    return 'quotation'
  } else if (text.includes('合作') || text.includes('洽谈')) {
    return 'negotiation'
  } else if (text.includes('产品') || text.includes('介绍')) {
    return 'inquiry'
  } else {
    return 'initial'
  }
}

// 获取最近有互动的联系人
export async function getRecentContacts(limit: number = 20): Promise<EmailContext[]> {
  const db = await getDB()
  
  const contacts = db.prepare(`
    SELECT * FROM email_conversation_context 
    ORDER BY last_contact_at DESC 
    LIMIT ?
  `).all(limit) as EmailContext[]
  
  return contacts
}

// 删除过期上下文（超过90天无互动）
export async function cleanExpiredContexts(): Promise<number> {
  const db = await getDB()
  
  const result = db.prepare(`
    DELETE FROM email_conversation_context 
    WHERE last_contact_at < datetime('now', '-90 days')
  `).run()
  
  console.log(`🧹 清理过期上下文: ${result.changes} 条`)
  return result.changes
}

export default {
  initContextTable,
  getEmailContext,
  updateEmailContext,
  getRecentContacts,
  cleanExpiredContexts
}

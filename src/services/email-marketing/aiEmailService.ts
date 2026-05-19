// AI邮件自动回复服务 - 使用真正的大模型
import { getDB } from './database'
import { sendEmail } from './emailService'
import * as http from 'http'
import * as https from 'https'

interface EmailContext {
  fromAddress: string
  fromName?: string
  subject: string
  content: string
}

interface AIReplyResult {
  success: boolean
  replySubject: string
  replyContent: string
  intent?: string
  confidence?: number
  needsReview?: boolean
  reviewReason?: string
}

interface EmailConfig {
  id: string
  email_address: string
  display_name?: string
}

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10, timeout: 60000 })
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10, timeout: 60000 })

function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) {
    console.warn('[Email AI] DEEPSEEK_API_KEY 环境变量未设置')
  }
  return key || ''
}

async function callDeepSeekAI(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('API Key 未配置')
  }

  return new Promise((resolve, reject) => {
    const url = 'https://api.deepseek.com/chat/completions'
    const parsedUrl = new URL(url)
    const isHttps = parsedUrl.protocol === 'https:'
    const client = isHttps ? https : http

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      agent: isHttps ? httpsAgent : httpAgent
    }

    const body = JSON.stringify({
      model: 'deepseek-v4-flash',
      messages,
      temperature: 0.7,
      max_tokens: 2000
    })

    const req = client.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          const content = json.choices?.[0]?.message?.content || ''
          resolve(content)
        } catch (e) {
          reject(new Error('解析AI响应失败'))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(60000, () => {
      req.destroy()
      reject(new Error('AI请求超时'))
    })

    req.write(body)
    req.end()
  })
}

export async function analyzeAndReplyEmail(email: EmailContext): Promise<AIReplyResult> {
  const db = await getDB()

  const config = db.prepare(`
    SELECT id, email_address, display_name 
    FROM email_config 
    WHERE is_active = 1 
    LIMIT 1
  `).get() as EmailConfig | undefined

  if (!config) {
    return { success: false, replySubject: '', replyContent: '', needsReview: true }
  }

  const systemPrompt = `你是"露丝引信（中国）技术有限公司"的AI客服助手，名为"小信"。

你的职责：
1. 专业、友好地回复客户的邮件
2. 仔细阅读客户邮件内容，理解他们的具体问题和需求
3. 提供有帮助、有针对性的回复，不要笼统敷衍
4. 根据邮件内容给出具体的信息或指导

回复要求：
- 称呼客户的姓名（如果有）
- 提及邮件中的具体内容或问题
- 提供实用的建议或信息
- 结束时询问是否需要进一步帮助
- 语气专业但亲切
- 回复用中文

如果客户询问产品相关问题，尽量给出产品特点和建议。
如果客户遇到技术问题，提供排查步骤或建议。
如果客户询价，引导他们提供需求以便给出准确报价。
如果客户表达合作意向，表示欢迎并提供联系方式。

公司签名：
露丝引信（中国）技术有限公司
邮箱：info@yinxin-tech.com
电话：400-xxx-xxxx`

  const userMessage = `
客户邮件信息：
发件人：${email.fromName || email.fromAddress}
邮箱：${email.fromAddress}
主题：${email.subject}

邮件内容：
${email.content}
---

请根据以上邮件内容，生成一封专业的回复邮件。
回复要：
1. 称呼客户姓名
2. 提及邮件中的具体问题
3. 提供有帮助的回复
4. 结尾询问是否需要进一步帮助

直接回复，不要说"好的，我来帮您..."这类开场白，直接开始写邮件正文。`

  try {
    const aiReply = await callDeepSeekAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ])

    if (!aiReply) {
      return {
        success: false,
        replySubject: `Re: ${email.subject}`,
        replyContent: '',
        needsReview: true
      }
    }

    return {
      success: true,
      replySubject: `Re: ${email.subject}`,
      replyContent: aiReply,
      intent: 'ai_generated',
      confidence: 1.0,
      needsReview: false
    }
  } catch (error: any) {
    console.error('[Email AI] AI调用失败:', error.message)
    return {
      success: false,
      replySubject: `Re: ${email.subject}`,
      replyContent: '',
      needsReview: true,
      reviewReason: `AI调用失败: ${error.message}`
    }
  }
}

export async function processEmailWithAI(emailId: string, configId: string): Promise<{
  processed: boolean
  autoReplied: boolean
  autoSent: boolean
  draftSaved: boolean
  error?: string
}> {
  const db = await getDB()

  const email = db.prepare('SELECT * FROM received_email WHERE id = ?').get(emailId) as any

  if (!email || email.is_spam) {
    return { processed: false, autoReplied: false, autoSent: false, draftSaved: false }
  }

  if (email.ai_replied === 1) {
    return { processed: true, autoReplied: false, autoSent: false, draftSaved: false }
  }

  const existingReply = db.prepare(`
    SELECT id FROM sent_email 
    WHERE to_address = ? AND subject LIKE ? AND sent_at > datetime(?, '-1 day')
  `).get(email.from_address, `Re: ${email.subject}%`, email.received_at)

  if (existingReply) {
    return { processed: true, autoReplied: false, autoSent: false, draftSaved: false }
  }

  const replyResult = await analyzeAndReplyEmail({
    fromAddress: email.from_address,
    fromName: email.from_name,
    subject: email.subject,
    content: email.content
  })

  let autoSent = false
  let draftSaved = false

  if (!replyResult.success || !replyResult.replyContent) {
    const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    db.prepare(`
      INSERT INTO sent_email 
      (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(draftId, configId, email.from_address, email.from_name, replyResult.replySubject,
      replyResult.reviewReason || 'AI生成失败', replyResult.intent || 'failed', 0, emailId)
    draftSaved = true
  } else if (replyResult.needsReview) {
    const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    db.prepare(`
      INSERT INTO sent_email 
      (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(draftId, configId, email.from_address, email.from_name, replyResult.replySubject,
      replyResult.replyContent, replyResult.intent, replyResult.confidence, emailId)
    draftSaved = true
  } else {
    const sendResult = await sendEmail({
      config_id: configId,
      to_address: email.from_address,
      to_name: email.from_name,
      subject: replyResult.replySubject,
      content: replyResult.replyContent
    })

    if (sendResult.success) {
      const sentId = `sent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      db.prepare(`
        INSERT INTO sent_email 
        (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, datetime('now', 'localtime'))
      `).run(sentId, configId, email.from_address, email.from_name, replyResult.replySubject,
        replyResult.replyContent, replyResult.intent, replyResult.confidence, emailId)
      autoSent = true
    } else {
      const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      db.prepare(`
        INSERT INTO sent_email 
        (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id, error_message)
        VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
      `).run(draftId, configId, email.from_address, email.from_name, replyResult.replySubject,
        replyResult.replyContent, replyResult.intent, replyResult.confidence, emailId, sendResult.error)
      draftSaved = true
    }
  }

  db.prepare('UPDATE received_email SET ai_replied = 1 WHERE id = ?').run(emailId)

  return {
    processed: true,
    autoReplied: true,
    autoSent,
    draftSaved
  }
}

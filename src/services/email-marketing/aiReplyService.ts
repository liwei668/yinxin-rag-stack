// AI邮件自动回复服务 - 增强版（知识检索 + 上下文 + 提词器）
import { getDB } from './database'
import { sendEmail } from './emailService'
import { promises as fs } from 'fs'
import path from 'path'
import { retrieveKnowledge } from './knowledgeRetrieval'
import { getEmailContext, updateEmailContext, initContextTable } from './emailContext'

interface EmailInfo {
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
  knowledgeUsed?: boolean
  contextUsed?: boolean
}

interface AIConfig {
  auto_reply_enabled: boolean
  auto_reply_review_required: boolean
}

const PROMPTS_PATH = path.join(process.cwd(), 'data', 'prompts.json')
const APIS_PATH = path.join(process.cwd(), 'data', 'apis.json')

async function getApiKey(): Promise<string> {
  try {
    const data = await fs.readFile(APIS_PATH, 'utf8')
    const apis = JSON.parse(data)
    const deepseekApi = apis.find((a: any) => a.api_id === 'deepseek-api' || a.name?.toLowerCase().includes('deepseek'))
    if (deepseekApi && deepseekApi.apiKey) {
      return deepseekApi.apiKey
    }
  } catch (error) {
    console.log('从apis.json读取API密钥失败')
  }
  return ''
}

async function getSystemPrompt(): Promise<string> {
  try {
    const data = await fs.readFile(PROMPTS_PATH, 'utf8')
    const prompts = JSON.parse(data)
    const defaultPrompt = prompts.find((p: any) => p.isDefault || p.isDefault === true)
    if (defaultPrompt && defaultPrompt.content) {
      console.log('✅ 加载提词器成功:', defaultPrompt.name)
      return defaultPrompt.content
    }
  } catch (error) {
    console.log('加载提词器失败，使用默认提示词')
  }
  
  return `你是"露丝"，引信（中国）技术有限公司的全能AI顾问。

你具备多重专业能力，可以根据用户的具体需求灵活切换角色：
- 财税法专家：财务、税务、法律相关问题
- 智能客服：日常咨询、服务需求
- 企业顾问：私有化部署、Agent自动化

回复要求：
1. 仔细阅读客户邮件，理解具体问题
2. 提供有帮助、有针对性的回复
3. 称呼客户姓名，提及邮件中的具体内容
4. 语气专业但亲切
5. 结尾询问是否需要进一步帮助`
}

async function callDeepSeekAI(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = await getApiKey()
  if (!apiKey) {
    throw new Error('API Key 未配置')
  }

  const url = 'https://api.deepseek.com/chat/completions'
  
  const body = JSON.stringify({
    model: 'deepseek-v4-flash',
    messages,
    temperature: 0.7,
    max_tokens: 2000
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI请求失败: ${response.status} - ${errorText}`)
  }

  const json = await response.json()
  const content = json.choices?.[0]?.message?.content || ''
  
  if (!content) {
    throw new Error('AI返回内容为空')
  }

  return content
}

export async function analyzeEmailIntent(email: EmailInfo): Promise<{ intent: string; confidence: number }> {
  const content = `${email.subject} ${email.content}`.toLowerCase()
  
  const intents = [
    {
      type: 'payment',
      keywords: ['付款', '支付', '转账', '退款', '发票', '报销', 'pay', 'payment', 'invoice', 'refund', 'transfer'],
      weight: 1.0,
      description: '付款相关'
    },
    {
      type: 'complaint',
      keywords: ['投诉', '不满', '很差', '失望', '垃圾', 'complaint', 'angry', 'frustrated', 'disappointed'],
      weight: 0.95,
      description: '投诉'
    },
    {
      type: 'quotation',
      keywords: ['询价', '报价', '多少钱', '价格', '优惠', '折扣', '便宜', 'price', 'quote', 'cost', 'discount'],
      weight: 0.9,
      description: '询价'
    },
    {
      type: 'cooperation',
      keywords: ['合作', '代理', '加盟', '分销', '商务', '洽谈', 'cooperation', 'partnership', 'agent', 'distribution', 'business'],
      weight: 0.85,
      description: '商务合作'
    },
    {
      type: 'support',
      keywords: ['帮助', '问题', '故障', '错误', '解决', '售后', '技术支持', '坏了', '不好用', '无法', 'support', 'help', 'issue', 'problem', 'broken', 'not working'],
      weight: 0.8,
      description: '技术支持'
    },
    {
      type: 'inquiry',
      keywords: ['咨询', '请问', '想了解', '产品', '如何', 'question', 'inquiry', 'info', 'information'],
      weight: 0.7,
      description: '咨询'
    },
    {
      type: 'greeting',
      keywords: ['你好', '您好', 'hi', 'hello', '早上好', '下午好', 'greetings'],
      weight: 0.65,
      description: '问候'
    }
  ]

  let bestIntent = 'general'
  let bestConfidence = 0.3

  for (const intent of intents) {
    const matches = intent.keywords.filter(keyword => content.includes(keyword))
    if (matches.length > 0) {
      const confidence = Math.min(0.95, intent.weight + matches.length * 0.05)
      if (confidence > bestConfidence) {
        bestIntent = intent.type
        bestConfidence = confidence
      }
    }
  }

  console.log(`📊 意图识别: ${bestIntent} (置信度: ${(bestConfidence * 100).toFixed(1)}%)`)
  return { intent: bestIntent, confidence: bestConfidence }
}

export async function generateEnhancedReply(email: EmailInfo): Promise<AIReplyResult> {
  const db = await getDB()
  
  const config = db.prepare(`
    SELECT auto_reply_enabled, auto_reply_review_required 
    FROM email_config 
    WHERE is_active = 1 
    LIMIT 1
  `).get() as AIConfig | undefined

  if (!config || !config.auto_reply_enabled) {
    return {
      success: false,
      replySubject: '',
      replyContent: '',
      needsReview: true
    }
  }

  console.log('\n🤖 === 开始增强型AI回复生成 ===\n')

  const { intent, confidence } = await analyzeEmailIntent(email)
  const needsReview = ['quotation', 'cooperation', 'complaint', 'payment'].includes(intent)

  try {
    // 1. 知识库检索
    console.log('📚 步骤1: 检索知识库...')
    const knowledgeResults = await retrieveKnowledge(`${email.subject} ${email.content}`, 3)
    const knowledgeUsed = knowledgeResults.length > 0
    
    if (knowledgeUsed) {
      console.log(`✅ 知识检索成功，找到 ${knowledgeResults.length} 条相关知识`)
    } else {
      console.log('⚠️  知识库无相关内容，将使用通用能力')
    }

    // 2. 上下文识别
    console.log('\n👤 步骤2: 识别邮件上下文...')
    let contextUsed = false
    let contextInfo = ''
    
    try {
      await initContextTable()
      const existingContext = await getEmailContext(email.fromAddress)
      
      if (existingContext) {
        contextUsed = true
        const keyPoints = JSON.parse(existingContext.key_points || '[]')
        contextInfo = `
客户历史信息：
- 邮件总数: ${existingContext.message_count} 封
- 当前阶段: ${existingContext.current_stage || '新客户'}
- 关注点: ${keyPoints.map((k: any) => k.value).join('、') || '无'}
- 最后联系: ${existingContext.last_contact_at || '首次联系'}
`
        console.log(`✅ 找到上下文: ${existingContext.message_count}封邮件，阶段: ${existingContext.current_stage}`)
      } else {
        console.log('📧 新客户，暂无历史上下文')
      }
    } catch (error: any) {
      console.log('⚠️  上下文识别失败:', error.message)
    }

    // 3. 构建增强Prompt
    console.log('\n📝 步骤3: 构建增强Prompt...')
    const systemPrompt = await getSystemPrompt()
    
    // 知识库上下文
    let knowledgeContext = ''
    if (knowledgeUsed) {
      knowledgeContext = `\n【知识库检索结果】\n${knowledgeResults.map((r, i) => 
        `${i + 1}. [相似度: ${(r.score * 100).toFixed(1)}%]\n${r.content}`
      ).join('\n\n')}\n\n请优先参考以上知识库内容进行回复。如果知识库内容不足，可以补充通用知识。`
    }

    // 用户消息
    const userMessage = `客户邮件信息：
发件人：${email.fromName || email.fromAddress}
邮箱：${email.fromAddress}
主题：${email.subject}

邮件内容：
${email.content}${contextInfo}${knowledgeContext}
---

请根据以上邮件内容，作为"露丝"生成一封专业的回复邮件。
要求：
1. 称呼客户姓名（如果有）
2. 提及邮件中的具体问题或内容
3. 优先参考知识库检索结果（如果有）
4. 结合客户历史上下文，提供连贯的对话体验
5. 提供有帮助、有针对性的回复
6. 语气专业但亲切
7. 结尾询问是否需要进一步帮助

直接回复邮件正文，不要说"好的，我来帮您..."这类开场白。`

    console.log('📤 步骤4: 调用DeepSeek AI...')
    const replyContent = await callDeepSeekAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ])

    console.log('\n✅ AI回复生成成功')
    console.log('回复预览:', replyContent.substring(0, 100).replace(/\n/g, ' '), '...')

    // 5. 更新上下文
    console.log('\n💾 步骤5: 更新邮件上下文...')
    try {
      await updateEmailContext(email.fromAddress, {
        subject: email.subject,
        content: email.content,
        fromName: email.fromName
      })
    } catch (error: any) {
      console.log('⚠️  更新上下文失败:', error.message)
    }

    return {
      success: true,
      replySubject: `Re: ${email.subject}`,
      replyContent,
      intent,
      confidence,
      needsReview,
      reviewReason: needsReview ? `识别为${intent}，需要人工审核` : '',
      knowledgeUsed,
      contextUsed
    }
  } catch (error: any) {
    console.error('\n❌ AI生成回复失败:', error)
    return {
      success: false,
      replySubject: `Re: ${email.subject}`,
      replyContent: '',
      intent,
      confidence,
      needsReview: true,
      reviewReason: `AI生成失败: ${error.message}`
    }
  }
}

// 保持原有接口兼容
export async function generateAutoReply(email: EmailInfo): Promise<AIReplyResult> {
  return generateEnhancedReply(email)
}

export async function processNewEmail(emailId: string, configId: string): Promise<{ processed: boolean; autoReplied: boolean; autoSent: boolean; draftSaved: boolean }> {
  const db = await getDB()
  
  const email = db.prepare('SELECT * FROM received_email WHERE id = ?').get(emailId) as any
  
  if (!email || email.is_spam) {
    return { processed: false, autoReplied: false, autoSent: false, draftSaved: false }
  }

  const existingReply = db.prepare(`
    SELECT id FROM sent_email 
    WHERE to_address = ? 
    AND subject LIKE ? 
    AND sent_at > datetime(?, '-1 day')
  `).get(email.from_address, `Re: ${email.subject}%`, email.received_at)

  if (existingReply) {
    console.log('⏭️  跳过: 24小时内已回复过')
    return { processed: true, autoReplied: false, autoSent: false, draftSaved: false }
  }

  console.log(`\n📧 开始处理邮件: ${email.subject}`)
  const replyResult = await generateEnhancedReply({
    fromAddress: email.from_address,
    fromName: email.from_name,
    subject: email.subject,
    content: email.content
  })

  if (!replyResult.success || !replyResult.replyContent) {
    return { processed: true, autoReplied: false, autoSent: false, draftSaved: false }
  }

  let autoSent = false
  let draftSaved = false

  if (replyResult.needsReview) {
    const draftId = `draft_${Date.now()}`
    db.prepare(`
      INSERT INTO sent_email 
      (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(
      draftId,
      configId,
      email.from_address,
      email.from_name,
      replyResult.replySubject,
      replyResult.replyContent,
      replyResult.intent,
      replyResult.confidence,
      emailId
    )
    draftSaved = true
    console.log('📝 保存草稿 (需要人工审核)')
  } else {
    const sendResult = await sendEmail({
      config_id: configId,
      to_address: email.from_address,
      to_name: email.from_name,
      subject: replyResult.replySubject,
      content: replyResult.replyContent
    })

    if (sendResult.success) {
      const sentId = `sent_${Date.now()}`
      db.prepare(`
        INSERT INTO sent_email 
        (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, datetime('now', 'localtime'))
      `).run(
        sentId,
        configId,
        email.from_address,
        email.from_name,
        replyResult.replySubject,
        replyResult.replyContent,
        replyResult.intent,
        replyResult.confidence,
        emailId
      )
      autoSent = true
      console.log('✅ 自动回复发送成功')
    } else {
      const draftId = `draft_${Date.now()}`
      db.prepare(`
        INSERT INTO sent_email 
        (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id, error_message)
        VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
      `).run(
        draftId,
        configId,
        email.from_address,
        email.from_name,
        replyResult.replySubject,
        replyResult.replyContent,
        replyResult.intent,
        replyResult.confidence,
        emailId,
        sendResult.error || '发送失败'
      )
      draftSaved = true
      console.log('📝 保存草稿 (发送失败)')
    }
  }

  db.prepare(`UPDATE received_email SET ai_replied = 1, intent = ? WHERE id = ?`).run(replyResult.intent, emailId)

  return { 
    processed: true, 
    autoReplied: true, 
    autoSent, 
    draftSaved 
  }
}

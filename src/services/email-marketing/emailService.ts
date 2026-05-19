// 邮件服务 - 发送和接收邮件
import { getDB } from './database'
import nodemailer from 'nodemailer'
import Imap from 'imap'
import { simpleParser } from 'mailparser'

interface EmailConfig {
  id: string
  email_address: string
  display_name?: string
  imap_host: string
  imap_port: number
  smtp_host: string
  smtp_port: number
  password: string
  use_ssl: number
  is_active: number
  auto_reply_enabled: number
  spam_filter_enabled: number
}

interface SendEmailParams {
  config_id: string
  to_address: string
  to_name?: string
  cc_address?: string
  bcc_address?: string
  subject: string
  content: string
  html_content?: string
  template_id?: string
  signature_id?: string
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string; message_id?: string }> {
  try {
    const db = await getDB()
    const config = db.prepare('SELECT * FROM email_config WHERE id = ? AND is_active = 1').get(params.config_id) as EmailConfig

    if (!config) {
      return { success: false, error: '邮箱配置不存在或未启用' }
    }

    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.use_ssl === 1,
      auth: {
        user: config.email_address,
        pass: config.password
      }
    })

    const mailOptions = {
      from: `"${config.display_name || config.email_address}" <${config.email_address}>`,
      to: params.to_name ? `"${params.to_name}" <${params.to_address}>` : params.to_address,
      cc: params.cc_address,
      bcc: params.bcc_address,
      subject: params.subject,
      text: params.content,
      html: params.html_content || params.content.replace(/\n/g, '<br>')
    }

    const info = await transporter.sendMail(mailOptions)

    // 保存到数据库
    const sentId = `sent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    db.prepare(`
      INSERT INTO sent_email 
      (id, config_id, to_address, to_name, cc_address, bcc_address, subject, content, html_content, template_id, signature_id, status, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', datetime('now', 'localtime'))
    `).run(
      sentId,
      params.config_id,
      params.to_address,
      params.to_name || null,
      params.cc_address || null,
      params.bcc_address || null,
      params.subject,
      params.content,
      params.html_content || null,
      params.template_id || null,
      params.signature_id || null
    )

    console.log('邮件发送成功', { to: params.to_address, subject: params.subject })

    return { success: true, message_id: info.messageId }
  } catch (error: any) {
    console.error('邮件发送失败', { error: error.message })
    return { success: false, error: error.message }
  }
}

export async function receiveEmails(config_id: string, limit: number = 20): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const db = await getDB()
    const config = db.prepare('SELECT * FROM email_config WHERE id = ? AND is_active = 1').get(config_id) as EmailConfig

    if (!config) {
      return { success: false, count: 0, error: '邮箱配置不存在或未启用' }
    }

    return new Promise((resolve) => {
      const imapConfig: any = {
        user: config.email_address,
        password: config.password,
        host: config.imap_host,
        port: config.imap_port,
        tls: config.use_ssl === 1,
        tlsOptions: { 
          rejectUnauthorized: false,
          servername: config.imap_host
        },
        connTimeout: 30000,
        authTimeout: 15000,
        keepalive: false
      }

      const imap = new Imap(imapConfig)

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
          if (err) {
            imap.end()
            resolve({ success: false, count: 0, error: err.message })
            return
          }

          // 如果没有邮件，直接返回
          if (!box.messages.total || box.messages.total === 0) {
            imap.end()
            resolve({ success: true, count: 0 })
            return
          }

          // 计算要获取的邮件范围
          const startSeq = Math.max(1, box.messages.total - limit + 1)
          const endSeq = box.messages.total

          const fetch = imap.fetch(`${startSeq}:${endSeq}`, {
            bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES)',
            struct: true
          })

          let processedCount = 0
          let savedCount = 0

          fetch.on('message', (msg, seqno) => {
            msg.on('body', async (stream, info) => {
              try {
                const parsed = await simpleParser(stream)
                const messageId = parsed.messageId || `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

                // 检查是否已存在
                const existing = db.prepare('SELECT id FROM received_email WHERE message_id = ?').get(messageId)
                if (existing) {
                  processedCount++
                  return
                }

                // 提取发件人信息
                const fromAddress = parsed.from?.value?.[0]?.address || 'unknown'
                const fromName = parsed.from?.value?.[0]?.name || null

                // 检查垃圾邮件
                const isSpam = config.spam_filter_enabled === 1 ? checkSpam(parsed.subject || '', parsed.text || '', fromAddress) : false
                const spamReason = isSpam ? '包含垃圾邮件关键词' : null

                // 保存邮件
                const emailId = `recv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
                db.prepare(`
                  INSERT INTO received_email 
                  (id, config_id, message_id, from_address, from_name, to_address, subject, content, html_content, has_attachment, thread_id, in_reply_to, references, received_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
                `).run(
                  emailId,
                  config_id,
                  messageId,
                  fromAddress,
                  fromName,
                  config.email_address,
                  parsed.subject || '',
                  parsed.text || '',
                  parsed.html || null,
                  parsed.attachments?.length > 0 ? 1 : 0,
                  parsed.headers?.get('thread-topic') || null,
                  parsed.inReplyTo || null,
                  parsed.references?.join(' ') || null
                )

                // 处理附件
                if (parsed.attachments && parsed.attachments.length > 0) {
                  const attachmentInsert = db.prepare(`
                    INSERT INTO email_attachment (id, email_id, email_type, filename, file_path, file_size, mime_type)
                    VALUES (?, ?, 'received', ?, ?, ?, ?)
                  `)

                  for (const att of parsed.attachments) {
                    attachmentInsert.run(
                      `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                      emailId,
                      att.filename,
                      att.contentId || '',
                      att.size,
                      att.contentType
                    )
                  }
                }

                // 自动创建联系人（如果不存在）
                const existingContact = db.prepare('SELECT id FROM contact WHERE email_address = ?').get(fromAddress)
                if (!existingContact && !isSpam) {
                  db.prepare(`
                    INSERT INTO contact (id, email_address, name, company, source)
                    VALUES (?, ?, ?, ?, 'email_inbound')
                  `).run(
                    `contact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    fromAddress,
                    fromName || fromAddress.split('@')[0],
                    null
                  )
                }

                savedCount++
                processedCount++
              } catch (parseError: any) {
                console.error('解析邮件失败', { error: parseError.message })
                processedCount++
              }
            })
          })

          fetch.on('error', (err) => {
            imap.end()
            resolve({ success: false, count: 0, error: err.message })
          })

          fetch.on('end', () => {
            imap.end()
            console.log('邮件接收完成', { processed: processedCount, saved: savedCount })
            resolve({ success: true, count: savedCount })
          })
        })
      })

      imap.once('error', (err) => {
        console.error('IMAP连接失败', { error: err.message })
        resolve({ success: false, count: 0, error: err.message })
      })

      imap.connect()
    })
  } catch (error: any) {
    console.error('接收邮件失败', { error: error.message })
    return { success: false, count: 0, error: error.message }
  }
}

function checkSpam(subject: string, content: string, fromAddress: string): boolean {
  // 简单垃圾邮件检查
  const spamKeywords = [
    '代开发票', '发票代开', '返点', '回扣', '刷单', '无息贷款',
    '低息贷款', '中奖', '点击这里', '立即点击', '账户异常'
  ]

  const allText = `${subject} ${content}`.toLowerCase()

  for (const keyword of spamKeywords) {
    if (allText.includes(keyword.toLowerCase())) {
      return true
    }
  }

  return false
}

export async function testEmailConnection(config_id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDB()
    const config = db.prepare('SELECT * FROM email_config WHERE id = ?').get(config_id) as EmailConfig

    if (!config) {
      return { success: false, error: '配置不存在' }
    }

    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.use_ssl === 1,
      auth: {
        user: config.email_address,
        pass: config.password
      }
    })

    await transporter.verify()
    return { success: true }
  } catch (error: any) {
    let errorMsg = error.message || '连接失败'
    
    if (errorMsg.includes('Invalid credentials') || errorMsg.includes('authentication failed')) {
      errorMsg = '认证失败：请确认使用的是【授权码】而非登录密码'
    } else if (errorMsg.includes('ECONNREFUSED')) {
      errorMsg = '连接被拒绝：请检查SMTP服务器地址和端口是否正确'
    } else if (errorMsg.includes('ETIMEDOUT')) {
      errorMsg = '连接超时：请检查网络连接'
    }
    
    return { success: false, error: errorMsg }
  }
}

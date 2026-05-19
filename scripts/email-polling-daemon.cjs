#!/usr/bin/env node
/**
 * 邮件AI自动回复守护进程
 * 与前端API服务保持一致的AI回复逻辑
 */

const Database = require('better-sqlite3');
const Imap = require('imap');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const https = require('https');

const DB_PATH = path.join(__dirname, '..', 'data', 'email-marketing', 'email-marketing.db');
const PROMPTS_PATH = path.join(__dirname, '..', 'data', 'prompts.json');
const APIS_PATH = path.join(__dirname, '..', 'data', 'apis.json');
const KNOWLEDGE_BASE_PATH = path.join(__dirname, '..', 'data', 'knowledge-base.json');

let db;

function getDB() {
    if (!db) {
        const dbDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
    }
    return db;
}

function getApiKey() {
    try {
        if (fs.existsSync(APIS_PATH)) {
            const data = fs.readFileSync(APIS_PATH, 'utf8');
            const apis = JSON.parse(data);
            const deepseekApi = apis.find(a => a.api_id === 'deepseek-api' || a.name?.toLowerCase().includes('deepseek'));
            if (deepseekApi && deepseekApi.apiKey) {
                return deepseekApi.apiKey;
            }
        }
    } catch (error) {
        console.log('⚠️  从apis.json读取API密钥失败');
    }
    
    const envKey = process.env.DEEPSEEK_API_KEY;
    if (envKey) {
        return envKey;
    }
    
    console.log('⚠️  DeepSeek API密钥未找到');
    return '';
}

function getSystemPrompt() {
    try {
        if (fs.existsSync(PROMPTS_PATH)) {
            const data = fs.readFileSync(PROMPTS_PATH, 'utf8');
            const prompts = JSON.parse(data);
            const defaultPrompt = prompts.find(p => p.isDefault || p.isDefault === true);
            if (defaultPrompt && defaultPrompt.content) {
                return defaultPrompt.content;
            }
        }
    } catch (error) {
        console.log('⚠️  加载提词器失败，使用默认提示词');
    }
    
    return `你是"露丝"，引信（中国）技术有限公司的全能AI顾问。你具备多重专业能力，可以根据用户的具体需求灵活切换角色：- 财税法专家：财务、税务、法律相关问题- 智能客服：日常咨询、服务需求- 企业顾问：私有化部署、Agent自动化。回复要求：1. 仔细阅读客户邮件，理解具体问题2. 提供有帮助、有针对性的回复3. 称呼客户姓名，提及邮件中的具体内容4. 语气专业但亲切5. 结尾询问是否需要进一步帮助。公司签名：露丝引信（中国）技术有限公司`;
}

async function callDeepSeekAI(messages) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('API Key 未配置');
    }

    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'deepseek-v4-flash',
            messages,
            temperature: 0.7,
            max_tokens: 2000
        });

        const options = {
            hostname: 'api.deepseek.com',
            port: 443,
            path: '/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const content = json.choices?.[0]?.message?.content || '';
                    resolve(content);
                } catch (e) {
                    reject(new Error('解析AI响应失败'));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error('AI请求超时'));
        });

        req.write(body);
        req.end();
    });
}

function cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
        const maxLength = Math.max(vec1.length, vec2.length);
        while (vec1.length < maxLength) vec1.push(0);
        while (vec2.length < maxLength) vec2.push(0);
    }
    
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        normA += vec1[i] * vec1[i];
        normB += vec2[i] * vec2[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
}

async function generateEmbedding(text) {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.log('⚠️  未配置API Key，跳过知识检索');
        return null;
    }

    return new Promise((resolve) => {
        const body = JSON.stringify({
            model: 'deepseek',
            input: text
        });

        const options = {
            hostname: 'api.deepseek.com',
            port: 443,
            path: '/embeddings',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.data && json.data[0] && json.data[0].embedding) {
                        resolve(json.data[0].embedding);
                    } else {
                        console.log('⚠️  嵌入接口返回格式错误');
                        resolve(null);
                    }
                } catch (e) {
                    console.log('⚠️  解析嵌入响应失败');
                    resolve(null);
                }
            });
        });

        req.on('error', () => { resolve(null); });
        req.setTimeout(30000, () => {
            req.destroy();
            resolve(null);
        });

        req.write(body);
        req.end();
    });
}

async function retrieveKnowledge(query) {
    if (!fs.existsSync(KNOWLEDGE_BASE_PATH)) {
        console.log('  ⚠️  知识库文件不存在');
        return [];
    }

    const knowledgeBase = JSON.parse(fs.readFileSync(KNOWLEDGE_BASE_PATH, 'utf8'));
    if (!knowledgeBase || knowledgeBase.length === 0) {
        console.log('  ⚠️  知识库为空');
        return [];
    }

    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) {
        console.log('  ⚠️  向量生成失败，跳过知识检索');
        return [];
    }

    const results = knowledgeBase
        .filter(doc => doc.embedding && doc.embedding.length > 0)
        .map(doc => ({
            content: doc.content,
            score: cosineSimilarity(queryEmbedding, doc.embedding),
            metadata: doc.metadata
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    console.log(`  📚 检索到 ${results.length} 条相关知识`);
    results.forEach((r, i) => {
        console.log(`    ${i + 1}. [${(r.score * 100).toFixed(1)}%] ${r.content.substring(0, 60)}...`);
    });

    return results;
}

function getEmailContext(emailAddress) {
    const localDb = getDB();
    const context = localDb.prepare(`
        SELECT * FROM email_conversation_context 
        WHERE email_address = ?
    `).get(emailAddress);
    
    if (context) {
        console.log(`  👤 发现历史上下文: ${context.message_count}封邮件, 阶段: ${context.current_stage}`);
    } else {
        console.log(`  👤 新客户，暂无历史上下文`);
    }
    
    return context;
}

function updateEmailContext(emailAddress, emailInfo) {
    const localDb = getDB();
    const existing = localDb.prepare(`
        SELECT * FROM email_conversation_context WHERE email_address = ?
    `).get(emailAddress);
    
    if (existing) {
        localDb.prepare(`
            UPDATE email_conversation_context
            SET message_count = message_count + 1,
                last_contact_at = datetime('now', 'localtime'),
                updated_at = datetime('now', 'localtime')
            WHERE email_address = ?
        `).run(emailAddress);
    } else {
        localDb.prepare(`
            INSERT INTO email_conversation_context
            (email_address, message_count, current_stage, created_at, updated_at)
            VALUES (?, 1, 'inquiry', datetime('now', 'localtime'), datetime('now', 'localtime'))
        `).run(emailAddress);
    }
}

function analyzeEmailIntent(subject, content) {
    const text = `${subject} ${content}`.toLowerCase();
    
    const intents = [
        { type: 'payment', keywords: ['付款', '支付', '转账', '退款', '发票', '报销', 'pay', 'payment', 'invoice', 'refund', 'transfer'], weight: 1.0 },
        { type: 'complaint', keywords: ['投诉', '不满', '很差', '失望', '垃圾', '骗', '坑', 'complaint', 'angry', 'frustrated', 'disappointed'], weight: 0.95 },
        { type: 'quotation', keywords: ['询价', '报价', '多少钱', '价格', '优惠', '折扣', '便宜', 'price', 'quote', 'cost', 'discount'], weight: 0.9 },
        { type: 'cooperation', keywords: ['合作', '代理', '加盟', '分销', '商务', '洽谈', 'cooperation', 'partnership', 'agent', 'distribution', 'business'], weight: 0.85 },
        { type: 'support', keywords: ['帮助', '问题', '故障', '错误', '解决', '售后', '技术支持', '坏了', '不好用', '无法', 'support', 'help', 'issue', 'problem', 'broken', 'not working'], weight: 0.8 },
        { type: 'inquiry', keywords: ['咨询', '请问', '想了解', '产品', '如何', 'question', 'inquiry', 'info', 'information'], weight: 0.7 },
        { type: 'greeting', keywords: ['你好', '您好', '哈喽', 'hi', 'hello', '早上好', '下午好', 'greetings'], weight: 0.65 }
    ];

    let bestIntent = 'general';
    let bestConfidence = 0.3;

    for (const intent of intents) {
        const matches = intent.keywords.filter(keyword => text.includes(keyword));
        if (matches.length > 0) {
            const confidence = Math.min(0.95, intent.weight + matches.length * 0.05);
            if (confidence > bestConfidence) {
                bestIntent = intent.type;
                bestConfidence = confidence;
            }
        }
    }

    return { intent: bestIntent, confidence: bestConfidence };
}

async function generateAIReply(email) {
    const systemPrompt = getSystemPrompt();

    const queryText = `${email.subject} ${email.content}`;
    
    const knowledgeResults = await retrieveKnowledge(queryText);
    
    const existingContext = getEmailContext(email.from_address);

    let knowledgeContext = '';
    if (knowledgeResults.length > 0) {
        knowledgeContext = `\n\n【知识库检索结果】\n${knowledgeResults.map((r, i) => 
            `${i + 1}. [相似度: ${(r.score * 100).toFixed(1)}%]\n${r.content}`
        ).join('\n\n')}\n\n请优先参考以上知识库内容进行回复。`;
    }
    
    let contextInfo = '';
    if (existingContext) {
        contextInfo = `\n\n【客户历史】\n- 邮件总数: ${existingContext.message_count}封\n- 当前阶段: ${existingContext.current_stage}`;
    }

    const userMessage = `客户邮件信息：
发件人：${email.from_name || email.from_address}
邮箱：${email.from_address}
主题：${email.subject}

邮件内容：
${email.content}${contextInfo}${knowledgeContext}

请根据以上邮件内容，作为"露丝"生成一封专业的回复邮件。
要求：
1. 称呼客户姓名（如果有）
2. 提及邮件中的具体问题或内容
3. 优先参考知识库检索结果
4. 结合客户历史上下文
5. 提供有帮助的回复
6. 语气专业但亲切
7. 结尾询问是否需要进一步帮助

直接回复邮件正文，不要说"好的，我来帮您..."这类开场白。`;

    try {
        const reply = await callDeepSeekAI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ]);
        
        updateEmailContext(email.from_address, email);
        
        return { success: true, content: reply };
    } catch (error) {
        console.log(`  ❌ AI生成失败: ${error.message}`);
        return { success: false, error: error.message };
    }
}

function checkSpam(subject, content) {
    const spamKeywords = [
        { keyword: '代开发票', score: 100 },
        { keyword: '发票代开', score: 100 },
        { keyword: '贷款', score: 40 },
        { keyword: '中奖', score: 80 },
        { keyword: '点击这里', score: 40 },
        { keyword: '确认账户', score: 60 },
        { keyword: '免费', score: 20 },
        { keyword: '限时', score: 15 }
    ];

    const text = `${subject} ${content}`.toLowerCase();
    let score = 0;

    for (const kw of spamKeywords) {
        if (text.includes(kw.keyword.toLowerCase())) {
            score += kw.score;
        }
    }

    return score >= 30;
}

async function receiveEmails(config, limit = 20) {
    return new Promise((resolve) => {
        const imapConfig = {
            user: config.email_address,
            password: config.password,
            host: config.imap_host,
            port: config.imap_port,
            tls: config.use_ssl === 1,
            tlsOptions: { rejectUnauthorized: false },
            connTimeout: 30000,
            authTimeout: 15000,
            keepalive: false
        };

        const imap = new Imap(imapConfig);
        const localDb = getDB();
        let savedCount = 0;

        imap.once('error', (err) => {
            console.log(`[${config.email_address}] IMAP错误: ${err.message}`);
            resolve({ success: false, count: 0, error: err.message });
        });

        imap.once('ready', () => {
            imap.openBox('INBOX', true, (err, box) => {
                if (err) {
                    imap.end();
                    resolve({ success: false, count: 0, error: err.message });
                    return;
                }

                if (!box.messages.total || box.messages.total === 0) {
                    imap.end();
                    resolve({ success: true, count: 0 });
                    return;
                }

                const startSeq = Math.max(1, box.messages.total - limit + 1);
                const fetch = imap.fetch(`${startSeq}:${box.messages.total}`, {
                    bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)',
                    struct: true
                });

                fetch.on('message', (msg) => {
                    msg.on('body', (stream, info) => {
                        const { simpleParser } = require('mailparser');
                        simpleParser(stream).then((parsed) => {
                            const messageId = parsed.messageId || `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

                            const existing = localDb.prepare('SELECT id FROM received_email WHERE message_id = ?').get(messageId);
                            if (existing) return;

                            const fromAddress = parsed.from?.value?.[0]?.address || 'unknown';
                            const fromName = parsed.from?.value?.[0]?.name || null;
                            const isSpam = config.spam_filter_enabled === 1 ? checkSpam(parsed.subject || '', parsed.text || '') : false;

                            const emailId = `recv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                            localDb.prepare(`
                                INSERT INTO received_email 
                                (id, config_id, message_id, from_address, from_name, to_address, subject, content, has_attachment, is_spam, spam_reason, received_at, ai_replied)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), 0)
                            `).run(emailId, config.id, messageId, fromAddress, fromName, config.email_address,
                                parsed.subject || '', parsed.text || '', parsed.attachments?.length > 0 ? 1 : 0,
                                isSpam ? 1 : 0, isSpam ? '包含垃圾邮件关键词' : null);

                            savedCount++;
                        }).catch(() => {});
                    });
                });

                fetch.on('end', () => {
                    imap.end();
                    console.log(`[${config.email_address}] 收取了 ${savedCount} 封新邮件`);
                    resolve({ success: true, count: savedCount });
                });

                fetch.on('error', () => {
                    imap.end();
                    resolve({ success: false, count: 0, error: '获取邮件失败' });
                });
            });
        });

        imap.connect();
    });
}

async function sendEmail(config, params) {
    return new Promise((resolve) => {
        const transporter = nodemailer.createTransport({
            host: config.smtp_host,
            port: config.smtp_port,
            secure: config.use_ssl === 1,
            auth: {
                user: config.email_address,
                pass: config.password
            }
        });

        transporter.sendMail({
            from: `"${config.display_name || config.email_address}" <${config.email_address}>`,
            to: params.to_address,
            subject: params.subject,
            text: params.content
        }, (err, info) => {
            if (err) {
                console.log(`[${config.email_address}] 发送失败: ${err.message}`);
                resolve({ success: false, error: err.message });
            } else {
                resolve({ success: true, message_id: info.messageId });
            }
        });
    });
}

async function processEmail(email, config) {
    const localDb = getDB();

    if (email.is_spam) {
        console.log(`  跳过: 垃圾邮件`);
        return { processed: true, autoReplied: false };
    }

    const existingReply = localDb.prepare(`
        SELECT id FROM sent_email 
        WHERE to_address = ? AND subject LIKE ? AND sent_at > datetime(?, '-1 day')
    `).get(email.from_address, `Re: ${email.subject}%`, email.received_at);

    if (existingReply) {
        console.log(`  跳过: 24小时内已回复过`);
        return { processed: true, autoReplied: false };
    }

    console.log(`  📝 正在使用AI生成回复...`);
    
    const { intent, confidence } = analyzeEmailIntent(email.subject, email.content);
    console.log(`  意图识别: ${intent} (置信度: ${(confidence * 100).toFixed(1)}%)`);
    
    const needsReview = ['quotation', 'cooperation', 'complaint', 'payment'].includes(intent);
    console.log(`  需要审核: ${needsReview ? '是' : '否'}`);

    const aiResult = await generateAIReply(email);

    if (!aiResult.success || !aiResult.content) {
        const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        localDb.prepare(`
            INSERT INTO sent_email 
            (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id)
            VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
        `).run(draftId, config.id, email.from_address, email.from_name, `Re: ${email.subject}`,
            aiResult.error || 'AI生成失败', intent, confidence, email.id);
        console.log(`  → 保存草稿 (AI生成失败)`);
        return { processed: true, autoReplied: true, draft: true };
    }

    console.log(`  ✅ AI回复生成成功`);
    console.log(`  回复预览: ${aiResult.content.substring(0, 80).replace(/\n/g, ' ')}...`);

    if (needsReview) {
        const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        localDb.prepare(`
            INSERT INTO sent_email 
            (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id)
            VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
        `).run(draftId, config.id, email.from_address, email.from_name, `Re: ${email.subject}`,
            aiResult.content, intent, confidence, email.id);
        console.log(`  → 保存草稿 (需要人工审核)`);
        return { processed: true, autoReplied: true, draft: true };
    } else {
        const sendResult = await sendEmail(config, {
            to_address: email.from_address,
            subject: `Re: ${email.subject}`,
            content: aiResult.content
        });

        if (sendResult.success) {
            const sentId = `sent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            localDb.prepare(`
                INSERT INTO sent_email 
                (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id, sent_at)
                VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, datetime('now', 'localtime'))
            `).run(sentId, config.id, email.from_address, email.from_name, `Re: ${email.subject}`,
                aiResult.content, intent, confidence, email.id);
            console.log(`  → ✅ 自动回复发送成功`);
            return { processed: true, autoReplied: true, sent: true };
        } else {
            const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            localDb.prepare(`
                INSERT INTO sent_email 
                (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id, error_message)
                VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
            `).run(draftId, config.id, email.from_address, email.from_name, `Re: ${email.subject}`,
                aiResult.content, intent, confidence, email.id, sendResult.error);
            console.log(`  → 保存草稿 (发送失败: ${sendResult.error})`);
            return { processed: true, autoReplied: true, draft: true };
        }
    }
}

async function pollAllConfigs() {
    const localDb = getDB();
    const configs = localDb.prepare('SELECT * FROM email_config WHERE is_active = 1 AND poll_enabled = 1').all();

    if (configs.length === 0) {
        console.log('没有启用轮询的邮箱配置');
        return;
    }

    console.log(`\n========== ${new Date().toLocaleString('zh-CN')} ==========`);
    console.log(`开始轮询 ${configs.length} 个邮箱\n`);

    let totalReceived = 0;
    let totalSent = 0;
    let totalDraft = 0;

    for (const config of configs) {
        console.log(`\n📧 处理邮箱: ${config.email_address}`);

        try {
            const receiveResult = await receiveEmails(config, 20);
            totalReceived += receiveResult.count;

            if (receiveResult.count > 0 && config.auto_reply_enabled === 1) {
                console.log(`  发现 ${receiveResult.count} 封新邮件，开始AI处理...\n`);

                const recentEmails = localDb.prepare(`
                    SELECT *
                    FROM received_email
                    WHERE config_id = ? AND ai_replied = 0
                    ORDER BY received_at DESC
                    LIMIT ?
                `).all(config.id, receiveResult.count);

                for (const email of recentEmails) {
                    console.log(`\n  处理邮件: ${email.subject}`);
                    const result = await processEmail(email, config);
                    localDb.prepare('UPDATE received_email SET ai_replied = 1 WHERE id = ?').run(email.id);
                    if (result.sent) totalSent++;
                    if (result.draft) totalDraft++;
                }
            } else if (receiveResult.count > 0) {
                console.log(`  自动回复未启用`);
            }

            localDb.prepare('UPDATE email_config SET last_poll_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(config.id);
        } catch (error) {
            console.log(`  ❌ 处理失败: ${error.message}`);
        }
    }

    console.log(`\n========== 轮询完成 ==========`);
    console.log(`📬 收到: ${totalReceived} 封`);
    console.log(`✅ 自动回复: ${totalSent} 封`);
    console.log(`📝 待审核: ${totalDraft} 封`);
    console.log('');
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--daemon') || args.includes('-d')) {
        const interval = parseInt(args.find(a => a.startsWith('--interval='))?.split('=')[1] || '5');

        console.log('');
        console.log('╔═══════════════════════════════════════════╗');
        console.log('║   📧 邮件AI自动回复守护进程             ║');
        console.log('╠═══════════════════════════════════════════╣');
        console.log(`║   轮询间隔: ${interval} 分钟                      ║`);
        console.log(`║   AI模型: DeepSeek V4 Flash              ║`);
        console.log(`║   提词器: 通用提词器（露丝）             ║`);
        console.log(`║   启动时间: ${new Date().toLocaleString('zh-CN').substring(0, 19)}  ║`);
        console.log('╚═══════════════════════════════════════════╝');
        console.log('');

        await pollAllConfigs();

        console.log(`\n⏰ 每 ${interval} 分钟自动检查一次新邮件...\n`);

        setInterval(async () => {
            await pollAllConfigs();
        }, interval * 60 * 1000);
    } else {
        await pollAllConfigs();
    }
}

main().catch(console.error);

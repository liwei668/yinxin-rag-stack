#!/usr/bin/env node
/**
 * 手动测试邮件收取和AI回复
 */

const Imap = require('imap');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
const https = require('https');

const DB_PATH = path.join(__dirname, '..', 'data', 'email-marketing', 'email-marketing.db');
const APIS_PATH = path.join(__dirname, '..', 'data', 'apis.json');
const PROMPTS_PATH = path.join(__dirname, '..', 'data', 'prompts.json');
const KNOWLEDGE_BASE_PATH = path.join(__dirname, '..', 'data', 'knowledge-base.json');

function getDB() {
    return new Database(DB_PATH);
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
    return `你是"露丝"，引信（中国）技术有限公司的全能AI顾问。`;
}

async function generateEmbedding(text) {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    return new Promise((resolve) => {
        const body = JSON.stringify({
            model: 'deepseek/deepseek-v2.5-fast',
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
                    resolve(json.data?.[0]?.embedding || null);
                } catch (e) {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.setTimeout(30000, () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
    });
}

function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function retrieveKnowledge(query) {
    const knowledgeBase = JSON.parse(fs.readFileSync(KNOWLEDGE_BASE_PATH, 'utf8'));
    if (!knowledgeBase || knowledgeBase.length === 0) return [];

    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) return [];

    return knowledgeBase
        .filter(doc => doc.embedding && doc.embedding.length > 0)
        .map(doc => ({
            content: doc.content,
            score: cosineSimilarity(queryEmbedding, doc.embedding),
            metadata: doc.metadata
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
}

async function callDeepSeekAI(messages) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('API Key 未配置');

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
                    resolve(json.choices?.[0]?.message?.content || '');
                } catch (e) {
                    reject(new Error('解析AI响应失败'));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('AI请求超时')); });
        req.write(body);
        req.end();
    });
}

function analyzeEmailIntent(subject, content) {
    const text = `${subject} ${content}`.toLowerCase();
    
    const intents = [
        { type: 'payment', keywords: ['付款', '支付', '转账', '退款', '发票', '报销'], weight: 1.0 },
        { type: 'complaint', keywords: ['投诉', '不满', '很差', '失望', '垃圾'], weight: 0.95 },
        { type: 'quotation', keywords: ['询价', '报价', '多少钱', '价格'], weight: 0.9 },
        { type: 'cooperation', keywords: ['合作', '代理', '加盟', '分销'], weight: 0.85 },
        { type: 'support', keywords: ['帮助', '问题', '故障', '错误', '解决', '坏了'], weight: 0.8 },
        { type: 'inquiry', keywords: ['咨询', '请问', '想了解', '产品'], weight: 0.7 },
        { type: 'greeting', keywords: ['你好', '您好', '哈喽'], weight: 0.65 }
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
    
    let knowledgeContext = '';
    if (knowledgeResults.length > 0) {
        knowledgeContext = `\n\n【知识库检索结果】\n${knowledgeResults.map((r, i) => 
            `${i + 1}. [相似度: ${(r.score * 100).toFixed(1)}%]\n${r.content}`
        ).join('\n\n')}\n\n请优先参考以上知识库内容进行回复。`;
    }

    const userMessage = `客户邮件信息：
发件人：${email.from_name || email.from_address}
邮箱：${email.from_address}
主题：${email.subject}

邮件内容：
${email.content}${knowledgeContext}

请根据以上邮件内容，作为"露丝"生成一封专业的回复邮件。
要求：
1. 称呼客户姓名（如果有）
2. 提及邮件中的具体问题或内容
3. 优先参考知识库检索结果
4. 提供有帮助的回复
5. 语气专业但亲切
6. 结尾询问是否需要进一步帮助

直接回复邮件正文，不要说"好的，我来帮您..."这类开场白。`;

    try {
        const reply = await callDeepSeekAI([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ]);
        
        return { success: true, content: reply };
    } catch (error) {
        return { success: false, content: '', error: error.message };
    }
}

async function testEmailPolling() {
    console.log('========================================');
    console.log('    手动测试邮件收取和AI回复');
    console.log('========================================');
    console.log('');

    const db = getDB();
    const config = db.prepare(`
        SELECT * FROM email_config WHERE is_active = 1 LIMIT 1
    `).get();

    if (!config) {
        console.error('❌ 未找到邮箱配置');
        return;
    }

    console.log(`📧 邮箱配置: ${config.email_address}`);
    console.log('');

    const imap = new Imap({
        user: config.email_address,
        password: config.password,
        host: config.imap_host,
        port: config.imap_port,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
    });

    imap.once('error', function(err) {
        console.error('❌ IMAP连接错误:', err.message);
    });

    imap.once('end', function() {
        console.log('');
        console.log('📪 IMAP连接已关闭');
    });

    console.log('🔗 正在连接IMAP服务器...');
    imap.connect();

    imap.once('ready', function() {
        console.log('✅ IMAP连接成功！');
        console.log('');

        imap.openBox('INBOX', true, function(err, box) {
            if (err) {
                console.error('❌ 打开收件箱失败:', err.message);
                imap.end();
                return;
            }

            console.log(`📬 收件箱统计：总共 ${box.messages.total} 封邮件`);
            console.log('');

            // 获取最新的一封邮件
            if (box.messages.total === 0) {
                console.log('📭 收件箱为空');
                imap.end();
                return;
            }

            const latestSeq = box.messages.total;
            console.log(`📧 获取最新1封邮件 (序列号: ${latestSeq})`);
            console.log('');

            const fetch = imap.fetch(`${latestSeq}:${latestSeq}`, {
                bodies: '',
                struct: true
            });

            fetch.on('message', async function(msg, seqno) {
                const { simpleParser } = require('mailparser');
                
                msg.on('body', async function(stream, info) {
                    try {
                        const parsed = await simpleParser(stream);
                        
                        console.log('📥 邮件信息：');
                        console.log(`   发件人: ${parsed.from?.value?.[0]?.name || '未知'} <${parsed.from?.value?.[0]?.address || '未知'}>`);
                        console.log(`   主题: ${parsed.subject || '无主题'}`);
                        console.log(`   时间: ${parsed.date}`);
                        console.log(`   内容预览: ${(parsed.text || '无正文').substring(0, 100)}...`);
                        console.log('');

                        // 检查是否已处理
                        const messageId = parsed.messageId || `local_${Date.now()}`;
                        const existing = db.prepare('SELECT id FROM received_email WHERE message_id = ?').get(messageId);
                        
                        if (existing) {
                            console.log('⏭️  该邮件已处理过，跳过');
                            return;
                        }

                        // 保存邮件
                        const emailId = `recv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                        db.prepare(`
                            INSERT INTO received_email 
                            (id, config_id, message_id, from_address, from_name, to_address, subject, content, has_attachment, is_spam, received_at, ai_replied)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now', 'localtime'), 0)
                        `).run(emailId, config.id, messageId, 
                            parsed.from?.value?.[0]?.address || 'unknown',
                            parsed.from?.value?.[0]?.name || null,
                            config.email_address,
                            parsed.subject || '',
                            parsed.text || '',
                            parsed.attachments?.length > 0 ? 1 : 0);

                        console.log('💾 邮件已保存到数据库');
                        console.log('');

                        // 意图识别
                        const intent = analyzeEmailIntent(parsed.subject || '', parsed.text || '');
                        console.log(`🎯 意图识别: ${intent.intent} (置信度: ${(intent.confidence * 100).toFixed(1)}%)`);
                        console.log('');

                        // 判断是否需要审核
                        const needsReview = ['payment', 'complaint', 'quotation', 'cooperation'].includes(intent.intent);
                        console.log(`📋 需要人工审核: ${needsReview ? '是 ⚠️' : '否 ✅'}`);
                        console.log('');

                        // 生成AI回复
                        console.log('🤖 正在生成AI回复...');
                        console.log('');
                        
                        const emailData = {
                            from_address: parsed.from?.value?.[0]?.address || 'unknown',
                            from_name: parsed.from?.value?.[0]?.name || null,
                            subject: parsed.subject || '',
                            content: parsed.text || ''
                        };

                        const aiResult = await generateAIReply(emailData);
                        
                        if (aiResult.success) {
                            console.log('✅ AI回复生成成功！');
                            console.log('');
                            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                            console.log('📝 AI生成的专业回复：');
                            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                            console.log(aiResult.content);
                            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                            console.log('');

                            // 保存回复草稿
                            const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                            db.prepare(`
                                INSERT INTO sent_email 
                                (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `).run(draftId, config.id, 
                                parsed.from?.value?.[0]?.address || 'unknown',
                                parsed.from?.value?.[0]?.name || null,
                                `Re: ${parsed.subject || '无主题'}`,
                                aiResult.content,
                                needsReview ? 'draft' : 'sent',
                                intent.intent,
                                intent.confidence,
                                emailId);

                            console.log(`💾 回复已保存 (状态: ${needsReview ? '草稿-待审核' : '已发送'})`);
                            
                            // 更新邮件状态
                            db.prepare('UPDATE received_email SET ai_replied = 1 WHERE id = ?').run(emailId);
                        } else {
                            console.error('❌ AI回复生成失败:', aiResult.error);
                        }

                    } catch (error) {
                        console.error('❌ 处理邮件失败:', error.message);
                    }
                });
            });

            fetch.once('error', function(err) {
                console.error('❌ 获取邮件失败:', err.message);
                imap.end();
            });

            fetch.once('end', function() {
                console.log('');
                console.log('✅ 邮件处理完成');
                imap.end();
            });
        });
    });
}

testEmailPolling();

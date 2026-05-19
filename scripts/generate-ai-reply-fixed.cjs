#!/usr/bin/env node
/**
 * 生成AI回复 - 处理已标记但未生成回复的邮件
 */

const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
const https = require('https');

const DB_PATH = path.join(__dirname, '..', 'data', 'email-marketing', 'email-marketing.db');
const APIS_PATH = path.join(__dirname, '..', 'data', 'apis.json');
const PROMPTS_PATH = path.join(__dirname, '..', 'data', 'prompts.json');

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
    } catch (error) {}
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
    } catch (error) {}
    return `你是"露丝"，引信（中国）技术有限公司的全能AI顾问。`;
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
                    reject(new Error('解析AI响应失败: ' + e.message));
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

    const userMessage = `客户邮件信息：
发件人：${email.from_name || email.from_address}
邮箱：${email.from_address}
主题：${email.subject}

邮件内容：
${email.content}

请根据以上邮件内容，作为"露丝"生成一封专业的回复邮件。
要求：
1. 称呼客户姓名（如果有）
2. 提及邮件中的具体问题或内容
3. 提供有帮助的回复
4. 语气专业但亲切
5. 结尾询问是否需要进一步帮助

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

async function test() {
    console.log('════════════════════════════════════════════════');
    console.log('  测试：生成AI专业回复');
    console.log('════════════════════════════════════════════════');
    console.log('');

    const db = getDB();
    const config = db.prepare(`
        SELECT * FROM email_config WHERE is_active = 1 LIMIT 1
    `).get();

    if (!config) {
        console.error('❌ 未找到邮箱配置');
        return;
    }

    // 获取最新的邮件（即使已经标记为ai_replied）
    const email = db.prepare(`
        SELECT * FROM received_email 
        ORDER BY received_at DESC 
        LIMIT 1
    `).get();

    if (!email) {
        console.log('📭 没有邮件');
        return;
    }

    console.log('📥 最新邮件：');
    console.log(`   ID: ${email.id}`);
    console.log(`   发件人: ${email.from_name || ''} <${email.from_address}>`);
    console.log(`   主题: ${email.subject}`);
    console.log(`   内容: ${(email.content || '').substring(0, 200)}...`);
    console.log(`   状态: ai_replied=${email.ai_replied}, intent=${email.intent}`);
    console.log('');

    // 检查是否已有回复
    const existingReply = db.prepare(`
        SELECT * FROM sent_email WHERE original_email_id = ?
    `).get(email.id);

    if (existingReply) {
        console.log('✅ 该邮件已有回复!');
        console.log(`   回复ID: ${existingReply.id}`);
        console.log(`   回复状态: ${existingReply.status}`);
        console.log('');
        console.log('📝 回复内容预览:');
        console.log(existingReply.content.substring(0, 500));
        return;
    }

    // 意图识别
    const intent = analyzeEmailIntent(email.subject || '', email.content || '');
    console.log(`🎯 意图识别: ${intent.intent} (置信度: ${(intent.confidence * 100).toFixed(1)}%)`);
    console.log('');

    // 生成AI回复
    console.log('🤖 正在生成AI回复...');
    console.log('⏳ 请稍候（可能需要10-30秒）...\n');

    const emailData = {
        from_address: email.from_address,
        from_name: email.from_name,
        subject: email.subject,
        content: email.content
    };

    const aiResult = await generateAIReply(emailData);
    
    if (aiResult.success) {
        console.log('✅ AI回复生成成功！');
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📝 AI专业回复:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(aiResult.content);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');

        // 保存回复
        const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        
        db.prepare(`
            INSERT INTO sent_email 
            (id, config_id, to_address, to_name, subject, content, status, intent, confidence, original_email_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            draftId,
            config.id,
            email.from_address,
            email.from_name,
            `Re: ${email.subject || '无主题'}`,
            aiResult.content,
            'draft', // 保存为草稿，需要审核
            intent.intent,
            intent.confidence,
            email.id
        );

        console.log(`💾 回复已保存!`);
        console.log(`   草稿ID: ${draftId}`);
        console.log(`   意图: ${intent.intent}`);
        console.log(`   置信度: ${(intent.confidence * 100).toFixed(1)}%`);
        
        // 更新邮件状态
        db.prepare('UPDATE received_email SET intent = ? WHERE id = ?')
            .run(intent.intent, email.id);

        console.log('');
        console.log('✅ 测试完成！');
        console.log('');
        console.log('📋 下一步：');
        console.log('   1. 您可以在后台管理界面查看并审核草稿');
        console.log('   2. 审核通过后，邮件将自动发送给客户');
        console.log('   3. 如果需要测试多轮对话，请回复客户的下一封邮件');
    } else {
        console.error('❌ AI回复生成失败:', aiResult.error);
    }
}

test().catch(error => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
});

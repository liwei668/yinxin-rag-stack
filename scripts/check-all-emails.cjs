#!/usr/bin/env node
/**
 * 检查更早期的邮件
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'email-marketing', 'email-marketing.db');

function checkAllEmails() {
    console.log('========================================');
    console.log('    检查所有邮件和回复');
    console.log('========================================\n');

    const db = new Database(DB_PATH);

    const sent = db.prepare(`
        SELECT id, to_name, to_address, subject, content, status, intent, sent_at
        FROM sent_email
        ORDER BY sent_at ASC
    `).all();

    console.log(`📤 共 ${sent.length} 封已发送/草稿邮件:\n`);

    let templateCount = 0;

    sent.forEach(e => {
        const isTemplate = e.content.includes('感谢您的来信') && e.content.includes('会尽快安排专人');
        console.log(`[${e.sent_at}] ${e.to_name || '未知'} <${e.to_address}>`);
        console.log(`   主题: ${e.subject}`);
        console.log(`   回复类型: ${isTemplate ? '❌ 模板回复' : '✅ 正常回复'}`);
        if (isTemplate) {
            templateCount++;
            console.log(`   内容:\n${e.content}\n`);
        }
    });

    console.log('----------------------------------------');
    console.log(`总计: ${sent.length} 封邮件`);
    console.log(`模板回复: ${templateCount} 封`);
    console.log(`正常回复: ${sent.length - templateCount} 封`);
    console.log('----------------------------------------\n');

    if (templateCount > 0) {
        console.log('⚠️  注意：有 ' + templateCount + ' 封是**修复之前**发送的模板邮件！');
        console.log('   这些是历史数据，不会影响新邮件的处理。');
        console.log('   新邮件会使用增强型AI回复。\n');
    } else {
        console.log('✅ 没有模板邮件！所有邮件都是增强型AI回复。\n');
    }

    db.close();
}

checkAllEmails();

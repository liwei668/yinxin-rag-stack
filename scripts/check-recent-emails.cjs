#!/usr/bin/env node
/**
 * 检查最近的邮件回复
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'email-marketing', 'email-marketing.db');

function checkRecentEmails() {
    console.log('========================================');
    console.log('    检查最近邮件和回复');
    console.log('========================================\n');

    const db = new Database(DB_PATH);

    // 检查received_email表
    const received = db.prepare(`
        SELECT id, from_name, from_address, subject, content, received_at, ai_replied
        FROM received_email
        ORDER BY received_at DESC
        LIMIT 10
    `).all();

    console.log('📥 最近收到的邮件:\n');
    received.forEach(e => {
        console.log(`   [${e.received_at}] ${e.from_name || '未知'} <${e.from_address}>`);
        console.log(`   主题: ${e.subject}`);
        console.log(`   内容: ${e.content.substring(0, 80)}...`);
        console.log(`   AI已回复: ${e.ai_replied ? '是' : '否'}\n`);
    });

    // 检查sent_email表
    const sent = db.prepare(`
        SELECT id, to_name, to_address, subject, content, status, intent, sent_at
        FROM sent_email
        ORDER BY sent_at DESC
        LIMIT 10
    `).all();

    console.log('📤 最近发送的邮件:\n');
    sent.forEach(e => {
        console.log(`   [${e.sent_at}] ${e.to_name || '未知'} <${e.to_address}>`);
        console.log(`   主题: ${e.subject}`);
        console.log(`   状态: ${e.status}`);
        console.log(`   意图: ${e.intent || '未知'}`);
        console.log(`   回复内容开头:\n${e.content.substring(0, 200)}\n`);
        
        const isTemplate = e.content.includes('感谢您的来信') && e.content.includes('会尽快安排专人');
        console.log(`   是否为模板回复: ${isTemplate ? '❌ 是' : '✅ 否'}\n`);
    });

    db.close();
}

checkRecentEmails();

#!/usr/bin/env node
/**
 * 简单测试邮件收取和保存
 */

const Imap = require('imap');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'email-marketing', 'email-marketing.db');

function getDB() {
    return new Database(DB_PATH);
}

async function simpleTest() {
    console.log('========================================');
    console.log('    简单测试邮件收取和保存');
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
    console.log(`🔐 密码长度: ${config.password?.length || 0} 位`);
    console.log('');

    const imap = new Imap({
        user: config.email_address,
        password: config.password,
        host: config.imap_host,
        port: config.imap_port,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
    });

    imap.on('error', function(err) {
        console.error('❌ IMAP错误:', err.message);
    });

    imap.on('alert', function(msg) {
        console.log('⚠️  IMAP警告:', msg);
    });

    console.log('🔗 连接IMAP...');
    imap.connect();

    imap.once('ready', function() {
        console.log('✅ IMAP连接成功\n');

        imap.openBox('INBOX', true, function(err, box) {
            if (err) {
                console.error('❌ 打开收件箱失败:', err.message);
                imap.end();
                return;
            }

            console.log(`📬 收件箱: ${box.messages.total} 封邮件\n`);

            // 获取最新邮件
            const seqNo = box.messages.total;
            console.log(`📧 获取第 ${seqNo} 封邮件...\n`);

            try {
                // 使用更简单的方式
                const fetch = imap.fetch(seqNo, {
                    bodies: 'TEXT',
                    struct: true
                });

                fetch.on('message', function(msg, seqno) {
                    console.log(`📧 收到消息 #${seqno}`);
                    
                    msg.on('body', function(stream, info) {
                        console.log(`📦 收到消息体, 大小: ${info.size} bytes`);
                        
                        // 简单收集数据
                        let buffer = '';
                        stream.on('data', function(chunk) {
                            buffer += chunk.toString('utf8');
                        });
                        
                        stream.on('end', async function() {
                            console.log(`📝 消息体长度: ${buffer.length} bytes`);
                            console.log(`📝 内容预览: ${buffer.substring(0, 200)}...`);
                            console.log('');

                            // 保存到数据库
                            const emailId = `recv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                            const messageId = `msg_${Date.now()}`;
                            
                            try {
                                db.prepare(`
                                    INSERT INTO received_email 
                                    (id, config_id, message_id, from_address, from_name, to_address, subject, content, has_attachment, is_spam, received_at, ai_replied)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), 0)
                                `).run(emailId, config.id, messageId, 
                                    'test@example.com',
                                    '测试用户',
                                    config.email_address,
                                    '测试邮件主题',
                                    buffer.substring(0, 5000),
                                    0,
                                    0);

                                console.log(`✅ 邮件已保存! ID: ${emailId}`);
                            } catch (dbError) {
                                console.error(`❌ 保存失败: ${dbError.message}`);
                            }
                        });
                    });

                    msg.on('attributes', function(attrs) {
                        console.log('📋 邮件属性:', JSON.stringify(attrs, null, 2));
                    });
                });

                fetch.on('error', function(err) {
                    console.error('❌ Fetch错误:', err.message);
                });

                fetch.on('end', function() {
                    console.log('\n✅ 获取完成');
                    imap.end();
                });

            } catch (error) {
                console.error('❌ Fetch异常:', error.message);
                imap.end();
            }
        });
    });

    imap.once('end', function() {
        console.log('\n📪 连接已关闭');
    });
}

simpleTest();

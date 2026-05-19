#!/usr/bin/env node
/**
 * 调试邮件收取问题
 */

const Imap = require('imap');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'email-marketing', 'email-marketing.db');

function getDB() {
    return new Database(DB_PATH);
}

async function debugEmailPolling() {
    console.log('========================================');
    console.log('    调试邮件收取问题');
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

            if (box.messages.total === 0) {
                console.log('📭 收件箱为空');
                imap.end();
                return;
            }

            const latestSeq = box.messages.total;
            console.log(`📧 尝试获取最新1封邮件 (序列号: ${latestSeq})`);
            console.log('');

            // 先获取邮件头信息
            const fetchHeader = imap.fetch(`${latestSeq}:${latestSeq}`, {
                bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)'
            });

            fetchHeader.on('message', function(msg, seqno) {
                console.log(`📧 消息 ${seqno} 头部信息:`);
                
                msg.on('body', function(stream, info) {
                    let header = '';
                    stream.on('data', function(chunk) {
                        header += chunk.toString('utf8');
                    });
                    stream.once('end', function() {
                        console.log(header);
                        console.log('');
                    });
                });
            });

            fetchHeader.once('error', function(err) {
                console.error('❌ 获取邮件头失败:', err.message);
            });

            fetchHeader.once('end', function() {
                console.log('📋 头部信息获取完成');
                console.log('');

                // 然后获取完整邮件
                console.log('📧 尝试获取完整邮件内容...');
                
                const { simpleParser } = require('mailparser');
                
                const fetchFull = imap.fetch(`${latestSeq}:${latestSeq}`, {
                    bodies: ''
                });

                fetchFull.on('message', async function(msg, seqno) {
                    console.log(`📧 处理消息 ${seqno}`);
                    
                    msg.on('body', async function(stream, info) {
                        try {
                            console.log('   正在解析邮件内容...');
                            const parsed = await simpleParser(stream);
                            
                            console.log('');
                            console.log('✅ 邮件解析成功！');
                            console.log('');
                            console.log('📥 邮件详细信息：');
                            console.log(`   发件人: ${parsed.from?.value?.[0]?.name || ''} <${parsed.from?.value?.[0]?.address || '未知'}>`);
                            console.log(`   主题: ${parsed.subject || '无主题'}`);
                            console.log(`   时间: ${parsed.date}`);
                            console.log(`   正文长度: ${(parsed.text || '').length} 字符`);
                            console.log(`   正文预览: ${(parsed.text || '无正文').substring(0, 150)}...`);
                            console.log('');

                            // 保存到数据库
                            const messageId = parsed.messageId || `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                            
                            // 检查是否已存在
                            const existing = db.prepare('SELECT id FROM received_email WHERE message_id = ?').get(messageId);
                            if (existing) {
                                console.log('⏭️  该邮件已处理过（通过message_id判断）');
                            } else {
                                const emailId = `recv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                                
                                try {
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

                                    console.log(`💾 邮件已保存到数据库 (ID: ${emailId})`);
                                    
                                    // 验证保存
                                    const saved = db.prepare('SELECT * FROM received_email WHERE id = ?').get(emailId);
                                    if (saved) {
                                        console.log('✅ 数据库验证：邮件保存成功');
                                        console.log('');
                                        console.log('📋 保存的邮件数据：');
                                        console.log(`   ID: ${saved.id}`);
                                        console.log(`   发件人: ${saved.from_address}`);
                                        console.log(`   主题: ${saved.subject}`);
                                        console.log(`   内容: ${saved.content.substring(0, 100)}...`);
                                    } else {
                                        console.error('❌ 数据库验证失败：未找到保存的邮件');
                                    }
                                } catch (dbError) {
                                    console.error('❌ 保存邮件失败:', dbError.message);
                                }
                            }

                        } catch (error) {
                            console.error('❌ 解析邮件失败:', error.message);
                            console.error(error.stack);
                        }
                    });
                });

                fetchFull.once('error', function(err) {
                    console.error('❌ 获取完整邮件失败:', err.message);
                    imap.end();
                });

                fetchFull.once('end', function() {
                    console.log('');
                    console.log('✅ 调试完成');
                    imap.end();
                });
            });
        });
    });
}

debugEmailPolling();

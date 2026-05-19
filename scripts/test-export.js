/**
 * 导出功能验证脚本
 * 测试 Word 和 PDF 导出效果及资源占用
 */

import { Document, Packer, Paragraph, TextRun, Table, TableCell, TableRow, WidthType } from 'docx';
import { chromium } from 'playwright';
import { marked } from 'marked';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试用的 AI 回复内容（包含各种复杂格式）
const testContent = `# 项目总结报告

## 一、项目概述

本项目旨在**提升系统性能**，通过优化数据库查询和引入缓存机制，实现了以下目标：

- 查询响应时间降低 *50%*
- 系统并发能力提升 **3倍**
- 错误率下降至 ***0.1%*** 以下

## 二、技术方案

### 2.1 数据库优化

采用以下策略优化数据库：

1. **索引优化**：为高频查询字段添加复合索引
2. **查询重构**：将 N+1 查询改为批量查询
3. **分库分表**：按时间维度进行数据分区

### 2.2 缓存策略

\`\`\`javascript
// Redis 缓存示例
const cache = await redis.get('user:123');
if (cache) {
  return JSON.parse(cache);
}
const data = await db.query('SELECT * FROM users WHERE id = ?', [123]);
await redis.setex('user:123', 3600, JSON.stringify(data));
return data;
\`\`\`

## 三、性能对比

| 指标 | 优化前 | 优化后 | 提升幅度 |
|------|--------|--------|----------|
| 平均响应时间 | 500ms | 120ms | 76% ↓ |
| P99 响应时间 | 2000ms | 350ms | 82% ↓ |
| 并发用户数 | 1000 | 5000 | 400% ↑ |
| 错误率 | 2.5% | 0.08% | 96.8% ↓ |

## 四、数学公式示例

性能提升计算公式：

$$
\text{提升率} = \frac{\text{优化前} - \text{优化后}}{\text{优化前}} \times 100\%
$$

## 五、总结

通过本次优化，系统整体性能得到**显著提升**，为后续业务扩展奠定了坚实基础。

---

*报告生成时间：2024年1月15日*
`;

// 创建输出目录
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🚀 开始导出功能验证测试\n');
console.log('测试内容长度：', testContent.length, '字符');
console.log('包含元素：标题、加粗、斜体、列表、代码块、表格、数学公式、分隔线\n');

// ==================== Word 导出测试 ====================
async function testWordExport() {
  console.log('📄 测试 Word 导出...');
  const startTime = Date.now();
  
  try {
    // 将 Markdown 转为 HTML 以便处理
    const htmlContent = await marked(testContent);
    
    // 简单的 Markdown 解析为段落
    const lines = testContent.split('\n');
    const paragraphs = [];
    let inCodeBlock = false;
    let codeContent = [];
    
    for (const line of lines) {
      // 代码块处理
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          // 结束代码块
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: codeContent.join('\n'),
                  font: 'Courier New',
                  size: 20,
                  color: '333333',
                }),
              ],
              shading: {
                fill: 'F5F5F5',
              },
              spacing: { before: 100, after: 100 },
            })
          );
          codeContent = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        continue;
      }
      
      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }
      
      // 表格处理（简化版）
      if (line.startsWith('|') && line.includes('|', 1)) {
        // 跳过分隔行
        if (line.match(/^\|[-:\s|]+\|$/)) continue;
        
        const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
        if (cells.length > 0) {
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: cells.join(' | ') })],
            })
          );
        }
        continue;
      }
      
      // 标题处理
      if (line.startsWith('# ')) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: line.replace('# ', ''), bold: true, size: 32 })],
            spacing: { after: 200 },
          })
        );
      } else if (line.startsWith('## ')) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: line.replace('## ', ''), bold: true, size: 28 })],
            spacing: { before: 200, after: 100 },
          })
        );
      } else if (line.startsWith('### ')) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: line.replace('### ', ''), bold: true, size: 24 })],
            spacing: { before: 150, after: 100 },
          })
        );
      } else if (line.startsWith('- ')) {
        // 列表项
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: '• ' + line.replace('- ', '') })],
            indent: { left: 360 },
          })
        );
      } else if (line.match(/^\d+\.\s/)) {
        // 有序列表
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: line })],
            indent: { left: 360 },
          })
        );
      } else if (line.trim() === '---') {
        // 分隔线
        paragraphs.push(new Paragraph({ text: '' }));
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: '─────────────────', color: 'CCCCCC' })],
          })
        );
        paragraphs.push(new Paragraph({ text: '' }));
      } else if (line.trim()) {
        // 普通段落（处理加粗和斜体）
        let text = line;
        const runs = [];
        
        // 简单的加粗处理 ***text***
        text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>');
        // 加粗 **text**
        text = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        // 斜体 *text*
        text = text.replace(/\*(.+?)\*/g, '<i>$1</i>');
        
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: text })],
            spacing: { after: 100 },
          })
        );
      }
    }
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: paragraphs,
      }],
    });
    
    const buffer = await Packer.toBuffer(doc);
    const outputPath = path.join(outputDir, 'test-word.docx');
    fs.writeFileSync(outputPath, buffer);
    
    const duration = Date.now() - startTime;
    const fileSize = (buffer.length / 1024).toFixed(2);
    
    console.log('✅ Word 导出成功');
    console.log(`   耗时: ${duration}ms`);
    console.log(`   文件大小: ${fileSize} KB`);
    console.log(`   输出路径: ${outputPath}\n`);
    
    return { success: true, duration, fileSize };
  } catch (error) {
    console.error('❌ Word 导出失败:', error.message);
    return { success: false, error: error.message };
  }
}

// ==================== PDF 导出测试 ====================
async function testPDFExport() {
  console.log('📑 测试 PDF 导出...');
  const startTime = Date.now();
  let browser;
  
  try {
    // 将 Markdown 转为 HTML
    const htmlContent = await marked(testContent);
    
    // 构建完整 HTML 页面
    const fullHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>导出测试</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
    }
    h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 10px; }
    h2 { font-size: 20px; color: #2c3e50; margin-top: 30px; }
    h3 { font-size: 16px; color: #34495e; }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background: #f8f8f8;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      border-left: 4px solid #3498db;
    }
    pre code {
      background: none;
      padding: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    th {
      background: #f2f2f2;
      font-weight: bold;
    }
    tr:nth-child(even) {
      background: #f9f9f9;
    }
    blockquote {
      border-left: 4px solid #3498db;
      margin: 0;
      padding-left: 20px;
      color: #666;
    }
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 30px 0;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>
    `;
    
    // 启动浏览器
    browser = await chromium.launch({
      headless: true,
    });
    
    const page = await browser.newPage();
    await page.setContent(fullHTML, { waitUntil: 'networkidle' });
    
    // 生成 PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    });
    
    const outputPath = path.join(outputDir, 'test-pdf.pdf');
    fs.writeFileSync(outputPath, pdfBuffer);
    
    const duration = Date.now() - startTime;
    const fileSize = (pdfBuffer.length / 1024).toFixed(2);
    
    console.log('✅ PDF 导出成功');
    console.log(`   耗时: ${duration}ms`);
    console.log(`   文件大小: ${fileSize} KB`);
    console.log(`   输出路径: ${outputPath}\n`);
    
    await browser.close();
    
    return { success: true, duration, fileSize };
  } catch (error) {
    console.error('❌ PDF 导出失败:', error.message);
    if (browser) await browser.close();
    return { success: false, error: error.message };
  }
}

// ==================== 压力测试 ====================
async function stressTest() {
  console.log('🔥 开始压力测试（3个并发）...\n');
  
  const startTime = Date.now();
  const promises = [];
  
  // 模拟 3 个并发导出
  for (let i = 0; i < 3; i++) {
    promises.push(
      testWordExport().then(r => ({ ...r, type: 'Word', index: i })),
      testPDFExport().then(r => ({ ...r, type: 'PDF', index: i }))
    );
  }
  
  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  
  console.log('\n📊 压力测试结果:');
  console.log(`   总耗时: ${duration}ms`);
  console.log(`   成功: ${results.filter(r => r.success).length}/${results.length}`);
  
  const avgWordTime = results
    .filter(r => r.type === 'Word' && r.success)
    .reduce((sum, r) => sum + r.duration, 0) / 3;
  const avgPDFTime = results
    .filter(r => r.type === 'PDF' && r.success)
    .reduce((sum, r) => sum + r.duration, 0) / 3;
  
  console.log(`   Word 平均耗时: ${avgWordTime.toFixed(0)}ms`);
  console.log(`   PDF 平均耗时: ${avgPDFTime.toFixed(0)}ms`);
}

// ==================== 主函数 ====================
async function main() {
  console.log('========================================');
  console.log('   导出功能验证测试');
  console.log('========================================\n');
  
  // 单次测试
  const wordResult = await testWordExport();
  const pdfResult = await testPDFExport();
  
  // 如果单次测试通过，进行压力测试
  if (wordResult.success && pdfResult.success) {
    await stressTest();
  }
  
  console.log('\n========================================');
  console.log('   测试完成');
  console.log('========================================');
  console.log(`\n输出文件目录: ${outputDir}`);
  console.log('请检查生成的文件质量是否符合预期');
}

main().catch(console.error);

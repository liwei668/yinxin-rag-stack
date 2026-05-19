/**
 * 导出功能验证脚本 V3 - 使用 docx 库 + 完整 Markdown 解析
 */

import { Document, Packer, Paragraph, TextRun, Table, TableCell, TableRow, HeadingLevel, AlignmentType, BorderStyle, convertInchesToTwip } from 'docx';
import { marked } from 'marked';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试用的 AI 回复内容
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

## 四、行内代码示例

使用 \`npm install\` 安装依赖，然后运行 \`npm start\` 启动服务。

## 五、总结

通过本次优化，系统整体性能得到**显著提升**，为后续业务扩展奠定了坚实基础。

---

*报告生成时间：2024年1月15日*
`;

const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 解析 HTML 为 docx 段落
function parseHTMLToDocx(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const paragraphs = [];
  
  function processNode(node, inheritedStyle = {}) {
    if (node.nodeType === dom.window.Node.TEXT_NODE) {
      return node.textContent;
    }
    
    if (node.nodeType !== dom.window.Node.ELEMENT_NODE) {
      return '';
    }
    
    const tagName = node.tagName.toLowerCase();
    let style = { ...inheritedStyle };
    
    // 处理样式
    switch (tagName) {
      case 'strong':
      case 'b':
        style.bold = true;
        break;
      case 'em':
      case 'i':
        style.italic = true;
        break;
      case 'code':
        style.font = 'Courier New';
        style.color = 'e74c3c';
        break;
    }
    
    // 处理子节点
    let text = '';
    for (const child of node.childNodes) {
      text += processNode(child, style);
    }
    
    return text;
  }
  
  function createTextRuns(node) {
    const runs = [];
    
    function walk(node, style = {}) {
      if (node.nodeType === dom.window.Node.TEXT_NODE) {
        if (node.textContent.trim()) {
          runs.push(new TextRun({
            text: node.textContent,
            ...style
          }));
        }
        return;
      }
      
      if (node.nodeType !== dom.window.Node.ELEMENT_NODE) return;
      
      const tagName = node.tagName.toLowerCase();
      let newStyle = { ...style };
      
      switch (tagName) {
        case 'strong':
        case 'b':
          newStyle.bold = true;
          break;
        case 'em':
        case 'i':
          newStyle.italic = true;
          break;
        case 'code':
          newStyle.font = 'Courier New';
          newStyle.color = 'e74c3c';
          newStyle.size = 20;
          break;
      }
      
      for (const child of node.childNodes) {
        walk(child, newStyle);
      }
    }
    
    walk(node);
    return runs;
  }
  
  // 遍历 body 的直接子元素
  const body = doc.body;
  for (const child of body.children) {
    const tagName = child.tagName.toLowerCase();
    
    switch (tagName) {
      case 'h1':
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: child.textContent, bold: true, size: 32 })],
          spacing: { after: 200 },
          border: { bottom: { color: '999999', size: 6, style: BorderStyle.SINGLE } }
        }));
        break;
        
      case 'h2':
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: child.textContent, bold: true, size: 28, color: '34495e' })],
          spacing: { before: 300, after: 150 },
          border: { left: { color: '3498db', size: 24, style: BorderStyle.SINGLE } }
        }));
        break;
        
      case 'h3':
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: child.textContent, bold: true, size: 24, color: '7f8c8d' })],
          spacing: { before: 200, after: 100 }
        }));
        break;
        
      case 'p':
        if (child.textContent.trim()) {
          const runs = createTextRuns(child);
          if (runs.length > 0) {
            paragraphs.push(new Paragraph({
              children: runs,
              spacing: { after: 120 }
            }));
          }
        }
        break;
        
      case 'ul':
        for (const li of child.querySelectorAll('li')) {
          const runs = createTextRuns(li);
          if (runs.length > 0) {
            paragraphs.push(new Paragraph({
              children: [new TextRun({ text: '• ' }), ...runs],
              indent: { left: 360 },
              spacing: { after: 60 }
            }));
          }
        }
        break;
        
      case 'ol':
        let index = 1;
        for (const li of child.querySelectorAll('li')) {
          const runs = createTextRuns(li);
          if (runs.length > 0) {
            paragraphs.push(new Paragraph({
              children: [new TextRun({ text: `${index}. ` }), ...runs],
              indent: { left: 360 },
              spacing: { after: 60 }
            }));
            index++;
          }
        }
        break;
        
      case 'pre':
        const codeBlock = child.textContent;
        paragraphs.push(new Paragraph({
          children: [new TextRun({ 
            text: codeBlock, 
            font: 'Courier New', 
            size: 18,
            color: '333333'
          })],
          shading: { fill: 'f8f8f8' },
          spacing: { before: 120, after: 120 },
          border: { left: { color: '3498db', size: 24, style: BorderStyle.SINGLE } }
        }));
        break;
        
      case 'table':
        const rows = [];
        const trs = child.querySelectorAll('tr');
        let isFirstRow = true;
        
        for (const tr of trs) {
          // 跳过表头分隔行（包含 --- 的行）
          if (tr.textContent.includes('---')) continue;
          
          const cells = [];
          const tds = tr.querySelectorAll('th, td');
          
          for (const td of tds) {
            cells.push(new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ 
                  text: td.textContent.trim(),
                  bold: isFirstRow,
                  size: 20
                })]
              })],
              shading: isFirstRow ? { fill: 'f2f2f2' } : undefined,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 6, color: 'cccccc' },
                bottom: { style: BorderStyle.SINGLE, size: 6, color: 'cccccc' },
                left: { style: BorderStyle.SINGLE, size: 6, color: 'cccccc' },
                right: { style: BorderStyle.SINGLE, size: 6, color: 'cccccc' }
              }
            }));
          }
          
          if (cells.length > 0) {
            rows.push(new TableRow({ children: cells }));
            isFirstRow = false;
          }
        }
        
        if (rows.length > 0) {
          paragraphs.push(new Table({
            rows,
            width: { size: 100, type: 'pct' }
          }));
          paragraphs.push(new Paragraph({ text: '' })); // 表格后空行
        }
        break;
        
      case 'hr':
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: '────────────────────────────────────────', color: 'cccccc' })],
          spacing: { before: 200, after: 200 }
        }));
        break;
    }
  }
  
  return paragraphs;
}

// ==================== Word 导出测试 V3 ====================
async function testWordExportV3() {
  console.log('📄 测试 Word 导出 V3（完整 Markdown 解析）...');
  const startTime = Date.now();
  
  try {
    // 配置 marked 选项
    marked.setOptions({
      gfm: true,
      breaks: true,
      headerIds: false
    });
    
    // 将 Markdown 转为 HTML
    const htmlContent = marked.parse(testContent);
    
    // 解析 HTML 为 docx 段落
    const paragraphs = parseHTMLToDocx(htmlContent);
    
    // 创建文档
    const doc = new Document({
      sections: [{
        properties: {},
        children: paragraphs
      }]
    });
    
    const buffer = await Packer.toBuffer(doc);
    const outputPath = path.join(outputDir, 'test-word-v3.docx');
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
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}

console.log('🚀 开始导出功能验证测试 V3\n');
console.log('使用 docx 库 + 完整 Markdown 解析\n');

testWordExportV3().then(result => {
  console.log('========================================');
  console.log('   测试完成');
  console.log('========================================');
  if (result.success) {
    console.log('\n✅ 请检查 test-word-v3.docx 的渲染效果');
    console.log('应该包含：标题层级、粗体、斜体、列表、代码块、表格');
  }
}).catch(console.error);

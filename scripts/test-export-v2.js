/**
 * 导出功能验证脚本 V2 - 使用 html-docx-js 保留完整样式
 */

import { chromium } from 'playwright';
import { marked } from 'marked';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 动态导入 html-docx-js（它是 CommonJS 模块）
const { default: HTMLDocx } = await import('html-docx-js');

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

## 四、行内代码示例

使用 \`npm install\` 安装依赖，然后运行 \`npm start\` 启动服务。

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

console.log('🚀 开始导出功能验证测试 V2\n');
console.log('测试内容长度：', testContent.length, '字符');
console.log('包含元素：标题、加粗、斜体、列表、代码块、表格、行内代码、分隔线\n');

// ==================== Word 导出测试 V2 ====================
async function testWordExportV2() {
  console.log('📄 测试 Word 导出 V2（html-docx-js）...');
  const startTime = Date.now();
  
  try {
    // 将 Markdown 转为 HTML
    const htmlContent = await marked(testContent);
    
    // 构建完整 HTML 页面（带样式）
    const fullHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>导出测试</title>
  <style>
    body {
      font-family: "Microsoft YaHei", "SimSun", sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
    }
    h1 { 
      font-size: 24px; 
      border-bottom: 2px solid #333; 
      padding-bottom: 10px;
      color: #2c3e50;
    }
    h2 { 
      font-size: 20px; 
      color: #34495e; 
      margin-top: 30px;
      border-left: 4px solid #3498db;
      padding-left: 10px;
    }
    h3 { 
      font-size: 16px; 
      color: #7f8c8d;
      margin-top: 20px;
    }
    strong { font-weight: bold; color: #2c3e50; }
    em { font-style: italic; color: #7f8c8d; }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      color: #e74c3c;
    }
    pre {
      background: #f8f8f8;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      border-left: 4px solid #3498db;
      margin: 15px 0;
    }
    pre code {
      background: none;
      padding: 0;
      color: #333;
      font-size: 13px;
      line-height: 1.5;
    }
    ul, ol {
      padding-left: 25px;
      margin: 10px 0;
    }
    li {
      margin: 5px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 14px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    th {
      background: #f2f2f2;
      font-weight: bold;
      color: #2c3e50;
    }
    tr:nth-child(even) {
      background: #f9f9f9;
    }
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 30px 0;
    }
    p {
      margin: 10px 0;
      text-align: justify;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>
    `;
    
    // 使用 html-docx-js 转换为 Word
    const docxBuffer = HTMLDocx.asBlob(fullHTML);
    
    const outputPath = path.join(outputDir, 'test-word-v2.docx');
    fs.writeFileSync(outputPath, Buffer.from(await docxBuffer.arrayBuffer()));
    
    const duration = Date.now() - startTime;
    const stats = fs.statSync(outputPath);
    const fileSize = (stats.size / 1024).toFixed(2);
    
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
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(fullHTML, { waitUntil: 'networkidle' });
    
    // 生成 PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    });
    
    const outputPath = path.join(outputDir, 'test-pdf-v2.pdf');
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

// ==================== 主函数 ====================
async function main() {
  console.log('========================================');
  console.log('   导出功能验证测试 V2');
  console.log('   使用 html-docx-js 保留完整样式');
  console.log('========================================\n');
  
  // 测试 Word V2
  const wordResult = await testWordExportV2();
  
  // 测试 PDF
  const pdfResult = await testPDFExport();
  
  console.log('========================================');
  console.log('   测试完成');
  console.log('========================================');
  console.log(`\n输出文件目录: ${outputDir}`);
  console.log('请检查 test-word-v2.docx 的样式渲染效果');
}

main().catch(console.error);

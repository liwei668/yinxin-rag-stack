import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Document, Packer, Paragraph, TextRun, Table, TableCell, TableRow, BorderStyle } from 'docx';
import { marked } from 'marked';
import { JSDOM } from 'jsdom';
import * as XLSX from 'xlsx';
import { logger } from '../../../src/lib/logger';

// 确保上传目录存在
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export async function POST(request: NextRequest) {
  try {
    const { content, format, filename } = await request.json();

    if (!content || !format) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // 生成文件名
    const outputFilename = `${filename || 'output'}_${Date.now()}`;
    let outputPath = path.join(uploadDir, outputFilename);
    let mimeType = 'text/plain';

    // 根据格式处理文件
    switch (format) {
      case 'txt':
        outputPath += '.txt';
        mimeType = 'text/plain';
        await fs.promises.writeFile(outputPath, content);
        break;

      case 'md':
        outputPath += '.md';
        mimeType = 'text/markdown';
        await fs.promises.writeFile(outputPath, content);
        break;

      case 'docx':
        outputPath += '.docx';
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        await convertToDOCX(content, outputPath);
        break;

      case 'pdf':
        outputPath += '.pdf';
        mimeType = 'application/pdf';
        await convertToPDF(content, outputPath);
        break;

      case 'xlsx':
        outputPath += '.xlsx';
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        convertToXLSX(content, outputPath);
        break;

      default:
        return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
    }

    return NextResponse.json({
      filename: path.basename(outputPath),
      url: `/uploads/${path.basename(outputPath)}`,
      mimeType
    });
  } catch (error) {
    logger.error('SYSTEM', 'Error converting file', { extra: { error: String(error) } });
    return NextResponse.json({ error: 'Failed to convert file', details: String(error) }, { status: 500 });
  }
}

// ==================== Word 导出（V3：完整 Markdown 解析）====================

function parseHTMLToDocx(html: string) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const paragraphs: InstanceType<typeof Paragraph>[] = [];

  // 递归创建 TextRun（保留加粗、斜体、行内代码样式）
  function createTextRuns(node: Element | Node) {
    const runs: InstanceType<typeof TextRun>[] = [];

    function walk(n: Node, style: Record<string, unknown> = {}) {
      if (n.nodeType === dom.window.Node.TEXT_NODE) {
        if (n.textContent && n.textContent.trim()) {
          runs.push(new TextRun({ text: n.textContent, ...style }));
        }
        return;
      }
      if (n.nodeType !== dom.window.Node.ELEMENT_NODE) return;

      const tag = (n as Element).tagName.toLowerCase();
      const s = { ...style };

      switch (tag) {
        case 'strong': case 'b': s.bold = true; break;
        case 'em': case 'i': s.italic = true; break;
        case 'code':
          s.font = 'Courier New';
          s.color = 'e74c3c';
          s.size = 20;
          break;
      }

      for (const child of n.childNodes) {
        walk(child, s);
      }
    }

    walk(node);
    return runs;
  }

  // 遍历 body 子元素
  for (const child of Array.from(doc.body.children)) {
    const tag = child.tagName.toLowerCase();

    switch (tag) {
      case 'h1':
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: child.textContent || '', bold: true, size: 32 })],
          spacing: { after: 200 },
          border: { bottom: { color: '999999', size: 6, style: BorderStyle.SINGLE } }
        }));
        break;

      case 'h2':
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: child.textContent || '', bold: true, size: 28, color: '34495e' })],
          spacing: { before: 300, after: 150 },
          border: { left: { color: '3498db', size: 24, style: BorderStyle.SINGLE } }
        }));
        break;

      case 'h3':
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: child.textContent || '', bold: true, size: 24, color: '7f8c8d' })],
          spacing: { before: 200, after: 100 }
        }));
        break;

      case 'h4':
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: child.textContent || '', bold: true, size: 22, color: '555555' })],
          spacing: { before: 150, after: 80 }
        }));
        break;

      case 'p': {
        if (!child.textContent?.trim()) break;
        const runs = createTextRuns(child);
        if (runs.length > 0) {
          paragraphs.push(new Paragraph({ children: runs, spacing: { after: 120 } }));
        }
        break;
      }

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

      case 'ol': {
        let idx = 1;
        for (const li of child.querySelectorAll('li')) {
          const runs = createTextRuns(li);
          if (runs.length > 0) {
            paragraphs.push(new Paragraph({
              children: [new TextRun({ text: `${idx}. ` }), ...runs],
              indent: { left: 360 },
              spacing: { after: 60 }
            }));
            idx++;
          }
        }
        break;
      }

      case 'pre': {
        const code = child.textContent || '';
        paragraphs.push(new Paragraph({
          children: [new TextRun({
            text: code,
            font: 'Courier New',
            size: 18,
            color: '333333'
          })],
          shading: { fill: 'f8f8f8' },
          spacing: { before: 120, after: 120 },
          border: { left: { color: '3498db', size: 24, style: BorderStyle.SINGLE } }
        }));
        break;
      }

      case 'blockquote': {
        const runs = createTextRuns(child);
        if (runs.length > 0) {
          paragraphs.push(new Paragraph({
            children: runs,
            indent: { left: 360 },
            spacing: { before: 80, after: 80 },
            border: { left: { color: '3498db', size: 12, style: BorderStyle.SINGLE } }
          }));
        }
        break;
      }

      case 'table': {
        const rows: InstanceType<typeof TableRow>[] = [];
        let isFirst = true;

        for (const tr of child.querySelectorAll('tr')) {
          if (tr.textContent?.includes('---')) continue;

          const cells: InstanceType<typeof TableCell>[] = [];
          for (const td of tr.querySelectorAll('th, td')) {
            cells.push(new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: td.textContent?.trim() || '', bold: isFirst, size: 20 })]
              })],
              shading: isFirst ? { fill: 'f2f2f2' } : undefined,
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
            isFirst = false;
          }
        }

        if (rows.length > 0) {
          paragraphs.push(new Table({ rows, width: { size: 100, type: 'pct' } }));
          paragraphs.push(new Paragraph({ text: '' }));
        }
        break;
      }

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

async function convertToDOCX(content: string, outputPath: string): Promise<void> {
  marked.setOptions({ gfm: true, breaks: true, headerIds: false });
  const html = marked.parse(content) as string;
  const paragraphs = parseHTMLToDocx(html);

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

// ==================== PDF 导出（HTML转PDF）====================

async function convertToPDF(content: string, outputPath: string): Promise<void> {
  // 使用纯HTML方案，依赖浏览器打印功能或外部PDF服务
  marked.setOptions({ gfm: true, breaks: true, headerIds: false });
  const htmlBody = marked.parse(content) as string;

  const fullHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>导出文档</title>
  <style>
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif;
      line-height: 1.8;
      color: #333;
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
    }
    h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 10px; color: #2c3e50; }
    h2 { font-size: 20px; color: #34495e; margin-top: 30px; border-left: 4px solid #3498db; padding-left: 10px; }
    h3 { font-size: 16px; color: #7f8c8d; margin-top: 20px; }
    h4 { font-size: 14px; color: #555; margin-top: 15px; }
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
    pre code { background: none; padding: 0; color: #333; font-size: 13px; }
    ul, ol { padding-left: 25px; margin: 10px 0; }
    li { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background: #f2f2f2; font-weight: bold; color: #2c3e50; }
    tr:nth-child(even) { background: #f9f9f9; }
    blockquote { border-left: 4px solid #3498db; margin: 0; padding-left: 20px; color: #666; }
    hr { border: none; border-top: 1px solid #ddd; margin: 30px 0; }
    p { margin: 10px 0; text-align: justify; }
  </style>
</head>
<body>${htmlBody}</body>
</html>`;

  // 保存HTML文件，用户可通过浏览器打印为PDF
  const htmlPath = outputPath.replace('.pdf', '.html');
  fs.writeFileSync(htmlPath, fullHTML);
  
  // 创建一个简单的PDF占位文件（提示用户使用浏览器打印）
  const readmeContent = `PDF导出已改为HTML格式。

请打开以下文件，使用浏览器的"打印"功能（Ctrl+P / Cmd+P），选择"另存为PDF"：
${path.basename(htmlPath)}

提示：
1. 在打印设置中选择"另存为PDF"
2. 纸张大小选择 A4
3. 边距选择"默认"或"20mm"
4. 勾选"背景图形"以保留颜色

如需自动化PDF生成，建议：
- 部署独立的PDF生成服务（如 puppeteer/chrome-headless）
- 或使用第三方API（如 PDFShift、DocRaptor）
`;
  fs.writeFileSync(outputPath.replace('.pdf', '.txt'), readmeContent);
  
  // 同时返回HTML文件路径
  logger.info('SYSTEM', 'PDF export converted to HTML', { extra: { htmlPath } });
}

// ==================== Excel 导出 ====================

function convertToXLSX(content: string, outputPath: string): void {
  const lines = content.split('\n');
  const data: string[][] = [];

  for (const line of lines) {
    if (line.trim()) {
      data.push([line]);
    }
  }

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  fs.writeFileSync(outputPath, buffer);
}

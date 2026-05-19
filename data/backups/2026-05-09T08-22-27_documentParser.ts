const safeDecodeURIComponent = (str: string): string => {
  try {
    return decodeURIComponent(str);
  } catch {
    return str.replace(/%([0-9A-Fa-f]{2})/g, (match, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return match;
      }
    });
  }
};

let pdfjsInitialized = false;

const ensurePdfjsWorker = async () => {
  if (pdfjsInitialized) return;
  pdfjsInitialized = true;
  
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const path = await import('path');
    const workerPath = path.join(
      process.cwd(), 
      'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
    );
    pdfjs.GlobalWorkerOptions.workerSrc = workerPath;
  } catch (error) {
    console.error('Failed to initialize pdfjs worker:', error);
  }
};

const loadPdf2json = async () => {
  try {
    const PDFParser = (await import('pdf2json')).default || (await import('pdf2json'));
    return PDFParser;
  } catch (error) {
    console.error('无法加载 pdf2json:', error);
    return null;
  }
};

const loadPdfjs = async () => {
  try {
    await ensurePdfjsWorker();
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return pdfjs;
  } catch (error) {
    console.error('无法加载 pdfjs:', error);
    return null;
  }
};

const loadMammoth = async () => {
  try {
    const module = await import('mammoth');
    return module.default || module;
  } catch (error) {
    console.error('无法加载 mammoth:', error);
    return null;
  }
};

const loadXlsx = async () => {
  try {
    const module = await import('xlsx');
    return module.default || module;
  } catch (error) {
    console.error('无法加载 xlsx:', error);
    return null;
  }
};

/**
 * 文档解析工具
 * 支持多种格式的文本提取
 */

interface ParseResult {
  success: boolean;
  content: string;
  error?: string;
  metadata?: {
    pageCount?: number;
    wordCount?: number;
  };
}

/**
 * 解析各种格式的文档
 */
export async function parseDocument(file: File): Promise<ParseResult> {
  const fileName = file.name.toLowerCase();
  const arrayBuffer = await file.arrayBuffer();

  try {
    if (fileName.endsWith('.pdf')) {
      return await parsePdf(arrayBuffer);
    } else if (fileName.endsWith('.docx')) {
      return await parseDocx(arrayBuffer);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      return await parseXlsx(arrayBuffer);
    } else if (fileName.endsWith('.pptx')) {
      return await parsePptx(arrayBuffer);
    } else {
      // 纯文本格式（txt, md, csv, json, html, code 等）
      return await parseText(file);
    }
  } catch (error) {
    console.error('文档解析失败:', error);
    return {
      success: false,
      content: '',
      error: error instanceof Error ? error.message : '解析失败'
    };
  }
}

/**
 * 解析 PDF
 */
async function parsePdf(arrayBuffer: ArrayBuffer): Promise<ParseResult> {
  try {
    let result: ParseResult;
    
    const pdfjs = await loadPdfjs();
    if (pdfjs) {
      result = await parsePdfWithPdfjsSmart(arrayBuffer, pdfjs);
    } else {
      const PDFParser = await loadPdf2json();
      if (PDFParser) {
        result = await parsePdfWithPdf2json(arrayBuffer, PDFParser);
      } else {
        return {
          success: false,
          content: '',
          error: '无法加载 PDF 解析库'
        };
      }
    }
    
    if (result.success && result.content) {
      result.content = postProcessPdfContent(result.content);
    }
    
    return result;
  } catch (error) {
    console.error('PDF 解析失败:', error);
    return {
      success: false,
      content: '',
      error: `PDF 解析失败: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
}

async function parsePdfWithPdf2json(arrayBuffer: ArrayBuffer, PDFParser: any): Promise<ParseResult> {
  return new Promise((resolve) => {
    const pdfParser = new (PDFParser as any)(null, 1);
    
    pdfParser.on('pdfParser_dataError', (errData: any) => {
      console.error('pdf2json 解析错误:', errData.parserError);
      resolve({
        success: false,
        content: '',
        error: `PDF 解析失败: ${errData.parserError}`
      });
    });
    
    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        let fullText = '';
        const numPages = pdfData?.Pages?.length || 0;
        
        for (const page of pdfData.Pages) {
          const textWithPositions: { text: string; x: number; y: number }[] = [];
          
          for (const text of page.Texts) {
            const y = Math.round(text.y * 10) / 10;
            const x = text.x;
            const textContent = safeDecodeURIComponent(text.R[0].T);
            textWithPositions.push({ text: textContent, x, y });
          }
          
          const pageLines: { [key: number]: { text: string; x: number }[] } = {};
          for (const item of textWithPositions) {
            if (!pageLines[item.y]) {
              pageLines[item.y] = [];
            }
            pageLines[item.y].push({ text: item.text, x: item.x });
          }
          
          const sortedYs = Object.keys(pageLines)
            .map(Number)
            .sort((a, b) => a - b);
          
          for (const y of sortedYs) {
            const sortedTexts = pageLines[y].sort((a, b) => a.x - b.x);
            const mergedLine: { text: string; startX: number; endX: number }[] = [];
            
            for (const item of sortedTexts) {
              if (mergedLine.length === 0) {
                mergedLine.push({ text: item.text, startX: item.x, endX: item.x });
              } else {
                  const last = mergedLine[mergedLine.length - 1];
                  const distance = item.x - last.endX;
                  if (distance < 15) {
                    last.text += item.text;
                    last.endX = item.x;
                  } else {
                    mergedLine.push({ text: item.text, startX: item.x, endX: item.x });
                  }
              }
            }
            
            const line = mergedLine.map((item) => item.text).join(' | ');
            fullText += line + '\n';
          }
          fullText += '\n--- 页面分隔 ---\n\n';
        }
        
        resolve({
          success: true,
          content: fullText.trim(),
          metadata: {
            pageCount: numPages,
            wordCount: fullText.split(/\s+/).filter(Boolean).length
          }
        });
      } catch (error) {
        console.error('pdf2json 数据处理错误:', error);
        resolve({
          success: false,
          content: '',
          error: `PDF 数据处理失败: ${error instanceof Error ? error.message : '未知错误'}`
        });
      }
    });
    
    const buffer = Buffer.from(arrayBuffer);
    pdfParser.parseBuffer(buffer);
  });
}

async function parsePdfWithPdfjsSmart(arrayBuffer: ArrayBuffer, pdfjs: any): Promise<ParseResult> {
  const buffer = Buffer.from(arrayBuffer);
  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data: uint8Array });
  const pdfDocument = await loadingTask.promise;
  
  let fullText = '';
  const numPages = pdfDocument.numPages;
  
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    
    const items = textContent.items.map((item: any) => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width
    }));
    
    const pageLines: { [key: number]: { text: string; x: number }[] } = {};
    
    for (const item of items) {
      if (!item.text || item.text.trim() === '') continue;
      const y = Math.round(item.y / 5) * 5;
      if (!pageLines[y]) {
        pageLines[y] = [];
      }
      pageLines[y].push({ text: item.text, x: item.x });
    }
    
    const sortedYs = Object.keys(pageLines)
      .map(Number)
      .sort((a, b) => b - a);
    
    for (const y of sortedYs) {
      const sortedItems = pageLines[y].sort((a, b) => a.x - b.x);
      
      const mergedItems: { text: string; startX: number; endX: number }[] = [];
      
      for (const item of sortedItems) {
        if (mergedItems.length === 0) {
          mergedItems.push({
            text: item.text,
            startX: item.x,
            endX: item.x + (item.text.length * 3)
          });
        } else {
          const last = mergedItems[mergedItems.length - 1];
          const distance = item.x - last.endX;
          
          if (distance < 12) {
            last.text += item.text;
            last.endX = item.x + (item.text.length * 3);
          } else {
            mergedItems.push({
              text: item.text,
              startX: item.x,
              endX: item.x + (item.text.length * 3)
            });
          }
        }
      }
      
      const line = mergedItems.map(item => item.text).join(' | ');
      if (line.trim()) {
        fullText += line + '\n';
      }
    }
    
    fullText += '\n--- 页面分隔 ---\n\n';
  }
  
  return {
    success: true,
    content: fullText.trim(),
    metadata: {
      pageCount: numPages,
      wordCount: fullText.split(/\s+/).filter(Boolean).length
    }
  };
}

async function parsePdfWithPdfjs(arrayBuffer: ArrayBuffer, pdfjs: any): Promise<ParseResult> {
  const buffer = Buffer.from(arrayBuffer);
  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data: uint8Array });
  const pdfDocument = await loadingTask.promise;
  
  let fullText = '';
  const numPages = pdfDocument.numPages;
  
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n\n';
  }
  
  return {
    success: true,
    content: fullText.trim(),
    metadata: {
      pageCount: numPages,
      wordCount: fullText.split(/\s+/).filter(Boolean).length
    }
  };
}

/**
 * 解析 DOCX (Word)
 */
async function parseDocx(arrayBuffer: ArrayBuffer): Promise<ParseResult> {
  try {
    const mammothLib = await loadMammoth();
    if (!mammothLib) {
      return {
        success: false,
        content: '',
        error: '无法加载 DOCX 解析库'
      };
    }
    const buffer = Buffer.from(arrayBuffer);
    const result = await mammothLib.extractRawText({ buffer });
    
    return {
      success: true,
      content: result.value,
      metadata: {
        wordCount: result.value.split(/\s+/).filter(Boolean).length
      }
    };
  } catch (error) {
    console.error('DOCX 解析失败:', error);
    return {
      success: false,
      content: '',
      error: `DOCX 解析失败: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
}

/**
 * 解析 XLSX (Excel)
 */
async function parseXlsx(arrayBuffer: ArrayBuffer): Promise<ParseResult> {
  try {
    const xlsxLib = await loadXlsx();
    if (!xlsxLib) {
      return {
        success: false,
        content: '',
        error: '无法加载 XLSX 解析库'
      };
    }
    const workbook = xlsxLib.read(arrayBuffer);
    let content = '';
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const sheetData = xlsxLib.utils.sheet_to_csv(sheet);
      content += `--- Sheet: ${sheetName} ---\n${sheetData}\n\n`;
    }
    
    return {
      success: true,
      content,
      metadata: {
        wordCount: content.split(/\s+/).filter(Boolean).length
      }
    };
  } catch (error) {
    console.error('XLSX 解析失败:', error);
    return {
      success: false,
      content: '',
      error: `XLSX 解析失败: ${error instanceof Error ? error.message : '未知错误'}`
    };
  }
}

/**
 * 解析 PPTX (PowerPoint)
 * 简单提取文本内容
 */
async function parsePptx(arrayBuffer: ArrayBuffer): Promise<ParseResult> {
  try {
    // PPTX 是 ZIP 格式，我们先简单处理
    // 注意：完整的 PPTX 解析需要更复杂的库
    const content = `[PPTX 文件]\n此格式的文本提取功能开发中...`;
    
    return {
      success: true,
      content,
      metadata: {
        wordCount: content.split(/\s+/).filter(Boolean).length
      }
    };
  } catch (error) {
    console.error('PPTX 解析失败:', error);
    return {
      success: false,
      content: '',
      error: 'PPTX 解析失败'
    };
  }
}

/**
 * 解析纯文本文件
 */
async function parseText(file: File): Promise<ParseResult> {
  try {
    const text = await file.text();
    
    return {
      success: true,
      content: text,
      metadata: {
        wordCount: text.split(/\s+/).filter(Boolean).length
      }
    };
  } catch (error) {
    console.error('文本解析失败:', error);
    return {
      success: false,
      content: '',
      error: '文本解析失败'
    };
  }
}

/**
 * 文本后处理 - 轻量清洗
 */
function cleanText(text: string): string {
  let cleaned = text;
  
  // 修复备注中的标点错乱
  cleaned = cleaned.replace(/\|\s*=/g, ' =');
  cleaned = cleaned.replace(/=\s*\|/g, '= ');
  
  // 去除多余空格（保留表格分隔）
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.replace(/\|\s+/g, '| ');
  cleaned = cleaned.replace(/\s+\|/g, ' |');
  
  // 去除连续空行
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  // 去除行首尾空格
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
  
  return cleaned;
}

/**
 * 检测并转换Markdown表格
 */
function convertToMarkdownTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  
  let currentTable: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 检测表格行（有 | 分隔符）
    const pipeCount = (line.match(/\|/g) || []).length;
    const isTableLine = pipeCount >= 2 && line.length > 10;
    
    // 检测是否是员工数据行（有数字开头或员工姓名特征）
    const looksLikeDataRow = /^\d+\s*\|/.test(line) || 
                             (pipeCount >= 2 && /[\d\u4e00-\u9fa5]/.test(line));
    
    // 检测页面分隔符
    const isPageSeparator = line.includes('--- 页面分隔 ---');
    
    if (isTableLine && looksLikeDataRow && !isPageSeparator) {
      currentTable.push(line);
    } else {
      // 如果之前有表格内容，先转换
      if (currentTable.length > 0) {
        const table = convertTableLines(currentTable);
        result.push(table);
        currentTable = [];
      }
      
      if (line) {
        result.push(line);
      }
    }
  }
  
  // 处理剩余的表格
  if (currentTable.length > 0) {
    const table = convertTableLines(currentTable);
    result.push(table);
  }
  
  return result.join('\n');
}

/**
 * 把表格行转换成Markdown表格
 */
function convertTableLines(tableLines: string[]): string {
  if (tableLines.length === 0) return '';
  
  const rows: string[] = [];
  
  for (const line of tableLines) {
    const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
    if (cells.length > 0) {
      rows.push('| ' + cells.join(' | ') + ' |');
    }
  }
  
  if (rows.length === 0) return tableLines.join('\n');
  
  const firstRowCells = tableLines[0].split('|').map(cell => cell.trim()).filter(cell => cell);
  const separator = '| ' + firstRowCells.map(() => '---').join(' | ') + ' |';
  
  return rows[0] + '\n' + separator + '\n' + rows.slice(1).join('\n');
}

/**
 * 检测表头并建立字段映射
 */
function detectTableHeader(tableLines: string[]): string[] | null {
  if (tableLines.length === 0) return null;
  
  const firstLine = tableLines[0];
  const cells = firstLine.split('|').map(cell => cell.trim()).filter(cell => cell);
  
  const headerKeywords = ['姓名', '工号', '部门', '工资', '社保', '公积金', '税', '补贴', '扣款', '实发', '序号', '基本'];
  const hasKeywords = cells.some(cell => headerKeywords.some(kw => cell.includes(kw)));
  const isDataRow = cells.every(cell => /^\d+\.?\d*$/.test(cell.trim()));
  
  if (hasKeywords || isDataRow) {
    return null;
  }
  
  return cells;
}

/**
 * 智能表格转自然语言
 */
function convertTableToNaturalLanguage(tableLines: string[], headerFields: string[] | null): string {
  if (tableLines.length === 0) return '';
  
  const results: string[] = [];
  
  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i];
    const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
    
    if (cells.length === 0) continue;
    
    const headerKeywords = ['姓名', '工号', '部门', '工资', '社保', '公积金', '税', '补贴', '扣款', '实发'];
    const isHeaderRow = cells.some(cell => headerKeywords.some(kw => cell.includes(kw)));
    
    if (isHeaderRow && i === 0) {
      continue;
    }
    
    if (headerFields && headerFields.length > 0 && cells.length <= headerFields.length) {
      const parts: string[] = [];
      for (let j = 0; j < cells.length; j++) {
        if (cells[j] && cells[j] !== '-' && cells[j] !== '') {
          const field = headerFields[j] || `字段${j + 1}`;
          parts.push(`${field}: ${cells[j]}`);
        }
      }
      if (parts.length > 0) {
        results.push('[' + parts.join(', ') + ']');
      }
    } else {
      const values = cells.filter(cell => cell && cell !== '-');
      if (values.length > 0) {
        results.push('[' + values.join(', ') + ']');
      }
    }
  }
  
  return results.join('\n');
}

/**
 * 检测并转换自然语言表格
 */
function convertToNaturalLanguageTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  
  let currentTable: string[] = [];
  let headerFields: string[] | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    const pipeCount = (line.match(/\|/g) || []).length;
    const isTableLine = pipeCount >= 2 && line.length > 10;
    const looksLikeDataRow = /^\d+\s*\|/.test(line) || 
                             (pipeCount >= 2 && /[\d\u4e00-\u9fa5]/.test(line));
    const isPageSeparator = line.includes('--- 页面分隔 ---');
    
    if (isTableLine && looksLikeDataRow && !isPageSeparator) {
      if (currentTable.length === 0 && headerFields === null) {
        const testLines = lines.slice(i, i + 5);
        headerFields = detectTableHeader(testLines);
      }
      
      currentTable.push(line);
    } else {
      if (currentTable.length > 0) {
        const naturalText = convertTableToNaturalLanguage(currentTable, headerFields);
        if (naturalText) {
          result.push(naturalText);
        }
        currentTable = [];
        headerFields = null;
      }
      
      if (line) {
        result.push(line);
      }
    }
  }
  
  if (currentTable.length > 0) {
    const naturalText = convertTableToNaturalLanguage(currentTable, headerFields);
    if (naturalText) {
      result.push(naturalText);
    }
  }
  
  return result.join('\n');
}

/**
 * PDF内容后处理（综合优化）
 */
function postProcessPdfContent(text: string): string {
  let result = text;
  
  result = cleanText(result);
  result = convertToNaturalLanguageTables(result);
  
  return result;
}

/**
 * 判断文件是否支持解析
 */
export function isSupportedFormat(fileName: string): boolean {
  const name = fileName.toLowerCase();
  return name.endsWith('.txt') ||
         name.endsWith('.md') ||
         name.endsWith('.json') ||
         name.endsWith('.csv') ||
         name.endsWith('.html') ||
         name.endsWith('.css') ||
         name.endsWith('.js') ||
         name.endsWith('.ts') ||
         name.endsWith('.jsx') ||
         name.endsWith('.tsx') ||
         name.endsWith('.py') ||
         name.endsWith('.java') ||
         name.endsWith('.go') ||
         name.endsWith('.rs') ||
         name.endsWith('.pdf') ||
         name.endsWith('.docx') ||
         name.endsWith('.xlsx') ||
         name.endsWith('.xls') ||
         name.endsWith('.pptx');
}

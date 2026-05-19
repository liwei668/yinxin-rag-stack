/**
 * Markdown 转 HTML 工具函数
 * 专门为 TipTap 编辑器设计，支持表格自动修复、列表合并
 */

// 转义 HTML 特殊字符
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 清洗表格单元格内容：换行转 <br>，去除首尾空白
function cleanCellContent(text: string): string {
  return text.replace(/\n/g, '<br>').trim();
}

// 渲染行内 Markdown（加粗、斜体、行内代码）
function renderInline(text: string): string {
  // 先处理行内代码（避免内部被处理）
  const parts = text.split(/(`[^`]+`)/);
  return parts.map(part => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
    }
    // 处理加粗和斜体
    return part
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }).join('');
}

// 修复不规范的 Markdown 表格：对齐列数、清洗单元格
function fixTable(rawLines: string[]): string[][] {
  if (rawLines.length === 0) return [];

  // 解析所有行
  const rows: string[][] = rawLines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      return trimmed.split('|').slice(1, -1).map(cell => cleanCellContent(cell));
    }
    return trimmed.split('|').map(cell => cleanCellContent(cell));
  });

  // 确定最大列数
  const maxCols = Math.max(...rows.map(r => r.length));

  // 补齐每行列数
  return rows.map(row => {
    while (row.length < maxCols) {
      row.push('');
    }
    return row.slice(0, maxCols);
  });
}

// 将 Markdown 转换为 TipTap 兼容的 HTML
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.split('\n');
  const htmlParts: string[] = [];
  let i = 0;

  // 列表缓冲：合并连续列表项
  let listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer || listBuffer.items.length === 0) {
      listBuffer = null;
      return;
    }
    const tag = listBuffer.type;
    const items = listBuffer.items.map(item => `<li>${item}</li>`).join('');
    htmlParts.push(`<${tag}>${items}</${tag}>`);
    listBuffer = null;
  };

  // 表格缓冲
  let tableBuffer: string[] = [];
  let inTable = false;

  const flushTable = () => {
    if (tableBuffer.length === 0) return;

    // 修复表格：补齐列数、清洗单元格
    const fixedRows = fixTable(tableBuffer);

    // 表头（第一行）
    const headerRow = fixedRows[0];
    // 数据行（剩余行）
    const dataRows = fixedRows.slice(1);

    let tableHtml = '<table>';

    // 表头
    if (headerRow) {
      tableHtml += '<thead><tr>';
      headerRow.forEach(cell => {
        tableHtml += `<th>${renderInline(cell)}</th>`;
      });
      tableHtml += '</tr></thead>';
    }

    // 表体
    if (dataRows.length > 0) {
      tableHtml += '<tbody>';
      dataRows.forEach(row => {
        tableHtml += '<tr>';
        row.forEach(cell => {
          tableHtml += `<td>${renderInline(cell)}</td>`;
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody>';
    }

    tableHtml += '</table>';
    htmlParts.push(tableHtml);
    tableBuffer = [];
    inTable = false;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 检测代码块
    if (trimmed.startsWith('```')) {
      flushList();
      flushTable();
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 跳过结束的 ```
      htmlParts.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // 检测表格行（排除分隔行）
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|', 1) && !/^[\s|:-]+$/.test(trimmed)) {
      inTable = true;
      tableBuffer.push(trimmed);
      i++;
      continue;
    }

    // 分隔行（|---|---|）如果在表格缓冲中，跳过它
    if (inTable && /^[\s|:-]+$/.test(trimmed)) {
      i++;
      continue;
    }

    // 如果之前在表格中，现在不是表格行了，刷新表格
    if (tableBuffer.length > 0) {
      flushTable();
    }

    // 跳过空行
    if (trimmed === '') {
      flushList();
      i++;
      continue;
    }

    // Markdown 标题
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const content = renderInline(headingMatch[2]);
      htmlParts.push(`<h${level}>${content}</h${level}>`);
      i++;
      continue;
    }

    // 无序列表
    if (trimmed.match(/^[-•*]\s+/)) {
      flushTable();
      const content = renderInline(trimmed.replace(/^[-•*]\s+/, ''));
      if (listBuffer && listBuffer.type === 'ul') {
        listBuffer.items.push(content);
      } else {
        flushList();
        listBuffer = { type: 'ul', items: [content] };
      }
      i++;
      continue;
    }

    // 有序列表
    if (trimmed.match(/^\d+\.\s+/)) {
      flushTable();
      const content = renderInline(trimmed.replace(/^\d+\.\s+/, ''));
      if (listBuffer && listBuffer.type === 'ol') {
        listBuffer.items.push(content);
      } else {
        flushList();
        listBuffer = { type: 'ol', items: [content] };
      }
      i++;
      continue;
    }

    // 引用
    if (trimmed.startsWith('> ')) {
      flushList();
      flushTable();
      const content = renderInline(trimmed.slice(2));
      htmlParts.push(`<blockquote><p>${content}</p></blockquote>`);
      i++;
      continue;
    }

    // 水平线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      flushTable();
      htmlParts.push('<hr>');
      i++;
      continue;
    }

    // 普通段落
    flushList();
    flushTable();
    htmlParts.push(`<p>${renderInline(trimmed)}</p>`);
    i++;
  }

  // 刷新缓冲
  flushList();
  flushTable();

  return htmlParts.join('\n');
}

// 在传入 TipTap 之前，对 Markdown 内容进行预处理和格式修复
export function prepareMarkdownForTipTap(markdown: string): string {
  if (!markdown) return '';

  let content = markdown;

  // 1. 确保表格前后有空行（但不破坏表格内部结构）
  // 在非表格行和非分隔行后、表格行前插入空行
  content = content.replace(/([^\n|])\n(\|)/g, '$1\n\n$2');
  // 在表格最后一行（后面不是 | 的行）后插入空行
  content = content.replace(/(\|[^\n]*)\n([^\n|])/g, '$1\n\n$2');

  // 2. 修复缺少分隔行的表格（在表头后自动插入分隔行）
  const lines = content.split('\n');
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].trim();
      // 下一行是表格数据行但没有分隔行
      if (nextTrimmed.startsWith('|') && nextTrimmed.endsWith('|') && !/^[\s|:-]+$/.test(nextTrimmed)) {
        const colCount = (trimmed.match(/\|/g) || []).length - 1;
        const separator = '|' + Array(colCount).fill('------').join('|') + '|';
        result.push(separator);
      }
    }
  }
  content = result.join('\n');

  // 3. 转换为 HTML
  return markdownToHtml(content);
}

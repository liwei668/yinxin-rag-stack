// 浏览器快照相关函数 - 从 browserManager.ts 拆分
// 所有函数接收 page 参数，不依赖 BrowserManager 实例

/* ========== 页面信息获取 ========== */

// C1 修复：使用 TreeWalker 遍历文本节点，不破坏 DOM
export async function getPageContent(page: any): Promise<string> {
  const content = await page.evaluate(() => {
    const textParts: string[] = [];
    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // 跳过 script/style/noscript 内的文本
          const parent = node.parentElement;
          if (parent && ['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG'].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          // 跳过空文本
          if (!node.textContent?.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent?.trim();
      if (text) textParts.push(text);
    }
    return textParts.join('\n');
  });
  return content.substring(0, 50000);
}

export async function getPageSnapshot(page: any): Promise<{
  title: string; url: string;
  forms: any[]; links: any[]; buttons: any[]; inputs: any[];
}> {
  return await page.evaluate(() => {
    const url = window.location.href;
    const title = document.title;

    const forms: any[] = [];
    document.querySelectorAll('form').forEach(form => {
      const inputs: any[] = [];
      form.querySelectorAll('input, textarea, select').forEach(el => {
        const e = el as HTMLInputElement;
        inputs.push({ type: e.type || 'text', name: e.name || '', id: e.id || '', placeholder: e.placeholder || '', value: e.value || '' });
      });
      forms.push({ action: form.action || '', method: (form.method || 'GET').toUpperCase(), inputs });
    });

    const links: any[] = [];
    document.querySelectorAll('a[href]').forEach(a => {
      const el = a as HTMLAnchorElement;
      const text = el.innerText?.trim();
      if (text && text.length < 100) links.push({ text: text.substring(0, 80), href: el.href });
    });

    const buttons: any[] = [];
    document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]').forEach(btn => {
      const el = btn as HTMLElement;
      const text = el.innerText?.trim() || (el as HTMLInputElement).value?.trim() || '';
      if (text) buttons.push({ text: text.substring(0, 80), type: (el as HTMLInputElement).type || el.tagName.toLowerCase(), id: el.id || '' });
    });

    const inputs: any[] = [];
    document.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach(el => {
      const e = el as HTMLInputElement;
      inputs.push({ type: e.type || 'text', name: e.name || '', id: e.id || '', placeholder: e.placeholder || '' });
    });

    return { title, url, forms, links: links.slice(0, 50), buttons, inputs };
  });
}

export async function waitForSelector(page: any, selector: string, timeout: number = 10000): Promise<boolean> {
  try {
    // 支持多重选择器（逗号分隔），任一匹配即成功
    const selectors = selector.split(',').map(s => s.trim());
    if (selectors.length > 1) {
      // 并行等待多个选择器
      const promises = selectors.map(sel =>
        page.waitForSelector(sel, { timeout }).then(() => sel).catch(() => null)
      );
      const result = await Promise.race(promises);
      if (result) {
        console.log(`[BrowserManager] waitForSelector 匹配成功: ${result} (候选: ${selector})`);
        return true;
      }
      return false;
    }
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

// C3 修复：executeScript 添加安全白名单限制
export const SCRIPT_WHITELIST = [
  'window.scrollTo', 'window.scrollBy', 'window.scroll',
  'document.querySelector', 'document.querySelectorAll',
  'document.getElementById', 'document.getElementsByClassName',
  'document.getElementsByTagName', 'document.getElementsByName',
  'getComputedStyle', 'getBoundingClientRect',
  'window.getSelection',
];

export async function executeScript(page: any, script: string): Promise<any> {
  // 安全检查：只允许白名单中的 API
  const isAllowed = SCRIPT_WHITELIST.some(api => script.includes(api));
  if (!isAllowed) {
    console.warn(`[BrowserManager] executeScript 被安全策略拦截: ${script.substring(0, 100)}`);
    return { error: '此脚本不在安全白名单中，已被拦截' };
  }

  return await page.evaluate((code) => new Function(code)(), script);
}

/* ========== 三层结构化页面快照（Phase 1.2） ========== */

/**
 * 三层快照策略：
 * - Layer 1（结构摘要，~500 token）：URL + 标题 + 页面类型 + 登录状态 + 弹窗列表 + 表单字段列表 + 数据区域描述
 * - Layer 2（DOM 关键节点，~1000 token）：可交互元素列表 + 数据表格结构
 * - Layer 3（截图 base64）：仅在需要视觉理解时使用
 */
export async function getPageSnapshotStructured(
  page: any,
  layer: 1 | 2 | 3,
  screenshotFn: () => Promise<string>,
  getBrowserInfoFn: () => Promise<{
    connected: boolean; hasPage: boolean; hasContext: boolean;
    url?: string; title?: string;
  }>,
): Promise<{
  layer: 1 | 2 | 3;
  summary: string;
  elements?: Array<{ type: string; tag: string; text: string; selector: string; attrs: Record<string, string> }>;
  tables?: Array<{ headers: string[]; rowCount: number; caption?: string }>;
  screenshot?: string;
}> {
  // ===== Layer 1: 结构摘要 =====
  if (layer === 1) {
    const layer1Data = await page.evaluate(() => {
      const url = window.location.href;
      const title = document.title;

      // 页面类型检测
      const bodyText = (document.body?.innerText || '').toLowerCase();
      let pageType = 'unknown';
      if (/login|signin|sign.in|登录|登陆/.test(bodyText) || /login|signin/.test(url.toLowerCase())) {
        pageType = 'login';
      } else if (/404|not found|页面不存在/.test(bodyText) || /404|500|error/.test(url.toLowerCase())) {
        pageType = 'error';
      } else {
        // 检测列表页（table 或 list 元素）
        const tables = document.querySelectorAll('table');
        const lists = document.querySelectorAll('ul, ol, [role="list"]');
        const hasDataTable = Array.from(tables).some(t => t.querySelectorAll('tbody tr').length > 2);
        if (hasDataTable) {
          pageType = 'list';
        } else if (lists.length > 0 && Array.from(lists).some(l => l.children.length > 3)) {
          pageType = 'list';
        }
        // 检测表单页（form/input 数量 > 3）
        const formInputs = document.querySelectorAll('form input, form textarea, form select');
        if (formInputs.length > 3) {
          pageType = 'form';
        }
        // 检测详情页（article/detail 内容区域）
        const articles = document.querySelectorAll('article, [role="article"], .article, .detail, .content');
        if (articles.length > 0) {
          const mainContent = Array.from(articles).find(a => (a.innerText || '').length > 200);
          if (mainContent) pageType = 'detail';
        }
        // 如果以上都不匹配，且有大量文本内容，也归为详情页
        if (pageType === 'unknown' && bodyText.length > 500) {
          pageType = 'detail';
        }
      }

      // 登录状态检测
      let loginStatus: 'logged_in' | 'not_logged_in' | 'unknown' = 'unknown';
      // 检测是否有"登录"/"注册"按钮（有=未登录）
      const loginBtnKeywords = ['登录', '登陆', '注册', 'login', 'signin', 'sign in', 'sign up', 'register'];
      const allButtons = document.querySelectorAll('a, button, [role="button"], input[type="submit"]');
      let hasLoginBtn = false;
      for (const btn of allButtons) {
        const text = (btn.innerText || (btn as HTMLInputElement).value || '').trim().toLowerCase();
        if (loginBtnKeywords.some(kw => text.includes(kw))) {
          hasLoginBtn = true;
          break;
        }
      }
      // 检测是否有用户头像/用户名（有=已登录）
      const userIndicators = document.querySelectorAll('[class*="avatar"], [class*="user"], [class*="profile"], [aria-label*="用户"], [aria-label*="user"]');
      let hasUserIndicator = false;
      for (const el of userIndicators) {
        const text = (el.innerText || '').trim();
        if (text.length > 0 && text.length < 30) {
          hasUserIndicator = true;
          break;
        }
      }
      if (hasLoginBtn && !hasUserIndicator) {
        loginStatus = 'not_logged_in';
      } else if (hasUserIndicator && !hasLoginBtn) {
        loginStatus = 'logged_in';
      }

      // 弹窗检测
      const popups: Array<{ type: string; text: string }> = [];
      // 检测 modal/dialog/popup 元素
      const modals = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="dialog"], [class*="popup"], [class*="overlay"]');
      for (const modal of modals) {
        const style = window.getComputedStyle(modal);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          const text = (modal.innerText || '').trim().substring(0, 100);
          popups.push({ type: 'modal', text });
        }
      }
      // 检测 overlay 遮罩层
      const overlays = document.querySelectorAll('[class*="overlay"], [class*="mask"], [class*="backdrop"]');
      for (const overlay of overlays) {
        const style = window.getComputedStyle(overlay);
        if (style.display !== 'none' && parseFloat(style.opacity) > 0.3) {
          popups.push({ type: 'overlay', text: '检测到遮罩层' });
        }
      }
      // 检测验证码相关元素
      const captchaElements = document.querySelectorAll('[class*="captcha"], [class*="verify"], [id*="captcha"], [id*="verify"], iframe[src*="captcha"]');
      for (const el of captchaElements) {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none') {
          popups.push({ type: 'captcha', text: '检测到验证码元素' });
        }
      }
      // 检测验证码文本关键词
      const captchaKeywords = ['验证码', 'captcha', 'verify', '请输入验证', '安全验证', '滑块', 'slider'];
      if (captchaKeywords.some(kw => bodyText.includes(kw))) {
        // 避免重复添加
        if (!popups.some(p => p.type === 'captcha')) {
          popups.push({ type: 'captcha', text: '页面文本中检测到验证码相关关键词' });
        }
      }

      // 表单字段列表
      const formFields: Array<{ type: string; name: string; id: string; placeholder: string; label: string }> = [];
      const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
      for (const input of inputs) {
        const el = input as HTMLInputElement;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            // 查找关联的 label
            let label = '';
            if (el.id) {
              const labelEl = document.querySelector(`label[for="${el.id}"]`);
              if (labelEl) label = (labelEl.innerText || '').trim();
            }
            if (!label) {
              const parent = el.closest('label, .form-group, .form-item, [class*="field"]');
              if (parent) {
                const labelInParent = parent.querySelector('label, span, .label');
                if (labelInParent) label = (labelInParent.innerText || '').trim().substring(0, 50);
              }
            }
            formFields.push({
              type: el.type || 'text',
              name: el.name || '',
              id: el.id || '',
              placeholder: el.placeholder || '',
              label: label || '',
            });
          }
        }
      }

      // 数据区域描述
      const dataAreas: string[] = [];
      // 检测表格
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const rows = table.querySelectorAll('tbody tr');
        if (rows.length > 0) {
          const headers = Array.from(table.querySelectorAll('th')).map(th => (th.innerText || '').trim()).filter(Boolean);
          dataAreas.push(`表格: ${headers.length > 0 ? headers.join(', ') : '无表头'}, ${rows.length} 行数据`);
        }
      }
      // 检测列表
      const listItems = document.querySelectorAll('ul > li, ol > li, [role="list"] > [role="listitem"]');
      if (listItems.length > 3) {
        const firstItemText = (listItems[0].innerText || '').trim().substring(0, 50);
        dataAreas.push(`列表: ${listItems.length} 项, 首项: "${firstItemText}"`);
      }
      // 检测文章/详情区域
      const articles = document.querySelectorAll('article, [role="article"], .article-content, .detail-content, .post-content');
      for (const article of articles) {
        const text = (article.innerText || '').trim();
        if (text.length > 100) {
          dataAreas.push(`文章区域: ${text.length} 字符`);
        }
      }

      return {
        url,
        title,
        pageType,
        loginStatus,
        popups,
        formFields: formFields.slice(0, 20), // 限制数量
        dataAreas: dataAreas.slice(0, 5),
      };
    });

    const summary = [
      `URL: ${layer1Data.url}`,
      `标题: ${layer1Data.title}`,
      `页面类型: ${layer1Data.pageType}`,
      `登录状态: ${layer1Data.loginStatus}`,
      layer1Data.popups.length > 0
        ? `弹窗: ${layer1Data.popups.map(p => `[${p.type}] ${p.text}`).join('; ')}`
        : '弹窗: 无',
      layer1Data.formFields.length > 0
        ? `表单字段: ${layer1Data.formFields.map(f => `[${f.type}]${f.label || f.placeholder || f.name || f.id}`).join(', ')}`
        : '表单字段: 无',
      layer1Data.dataAreas.length > 0
        ? `数据区域: ${layer1Data.dataAreas.join('; ')}`
        : '数据区域: 无',
    ].join('\n');

    return { layer: 1, summary };
  }

  // ===== Layer 2: DOM 关键节点 =====
  if (layer === 2) {
    const layer2Data = await page.evaluate(() => {
      // 可交互元素列表
      const interactiveElements: Array<{ type: string; tag: string; text: string; selector: string; attrs: Record<string, string> }> = [];
      const candidates = document.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), textarea, select, [role="button"], [role="link"], [role="tab"], [contenteditable="true"], [onclick]'
      );
      for (const el of candidates) {
        const htmlEl = el as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const style = window.getComputedStyle(htmlEl);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) <= 0) continue;

        const tag = htmlEl.tagName.toLowerCase();
        const text = (htmlEl.innerText || (htmlEl as HTMLInputElement).value || '').trim().substring(0, 80);
        const attrs: Record<string, string> = {};
        const attrNames = ['id', 'name', 'class', 'placeholder', 'aria-label', 'title', 'href', 'type', 'role'];
        for (const attr of attrNames) {
          const val = htmlEl.getAttribute(attr);
          if (val) attrs[attr] = val.substring(0, 80);
        }

        // 生成 selector：优先可见文本，其次 id/name/aria-label
        let selector = text || attrs['aria-label'] || attrs['title'] || attrs['placeholder'] || attrs['id'] || attrs['name'] || '';

        let type = 'unknown';
        if (tag === 'a' || attrs['role'] === 'link') type = 'link';
        else if (tag === 'button' || attrs['role'] === 'button' || attrs['type'] === 'submit' || attrs['type'] === 'button') type = 'button';
        else if (tag === 'input' && ['text', 'password', 'email', 'tel', 'number', 'search', 'url'].includes(attrs['type'])) type = 'input';
        else if (tag === 'input' && attrs['type'] === 'checkbox') type = 'checkbox';
        else if (tag === 'input' && attrs['type'] === 'radio') type = 'radio';
        else if (tag === 'textarea' || attrs['contenteditable'] === 'true') type = 'textarea';
        else if (tag === 'select') type = 'select';

        interactiveElements.push({ type, tag, text, selector, attrs });
      }

      // 数据表格结构
      const tables: Array<{ headers: string[]; rowCount: number; caption?: string }> = [];
      document.querySelectorAll('table').forEach(table => {
        const headers = Array.from(table.querySelectorAll('thead th, thead td, tr:first-child th'))
          .map(th => (th.innerText || '').trim())
          .filter(Boolean);
        const rows = table.querySelectorAll('tbody tr');
        const caption = table.querySelector('caption')?.innerText?.trim() || undefined;
        if (rows.length > 0 || headers.length > 0) {
          tables.push({ headers, rowCount: rows.length, caption });
        }
      });

      return { interactiveElements: interactiveElements.slice(0, 50), tables: tables.slice(0, 10) };
    });

    const summary = [
      `可交互元素: ${layer2Data.interactiveElements.length} 个`,
      `数据表格: ${layer2Data.tables.length} 个`,
    ].join('\n');

    return {
      layer: 2,
      summary,
      elements: layer2Data.interactiveElements,
      tables: layer2Data.tables,
    };
  }

  // ===== Layer 3: 截图 base64 =====
  if (layer === 3) {
    const screenshot = await screenshotFn();
    const info = await getBrowserInfoFn();
    const summary = `截图已获取 | URL: ${info.url || 'unknown'} | 标题: ${info.title || 'unknown'}`;
    return { layer: 3, summary, screenshot };
  }

  // 不应到达此处
  return { layer: 1, summary: '无效的 layer 参数' };
}

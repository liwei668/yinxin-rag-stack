// Playwright 浏览器管理服务 - 工厂模式，支持多任务并发和会话隔离
// 支持 noVNC 模式：通过 CDP 连接外部 Chrome 实例
import fs from 'fs';
import path from 'path';
import { permissionController } from './permissionController';
import { INJECT_SCRIPT } from './injectScript';
import { getChromium, humanDelay, jitter, getVirtualKeyCode } from './browserUtils';
import { getPageContent as getPageContentFn, getPageSnapshot as getPageSnapshotFn, waitForSelector as waitForSelectorFn, executeScript as executeScriptFn, getPageSnapshotStructured as getPageSnapshotStructuredFn } from './browserSnapshot';

/* ========== 配置 ========== */
const CDP_URL = process.env.CDP_URL || 'http://localhost:9222';
const USE_VNC = process.env.USE_VNC === 'true'; // 是否使用 noVNC 模式

class BrowserManager {
  private browser: any = null;
  private context: any = null;
  private page: any = null;
  private userDataDir: string;
  private _saveInterval: any = null;

  constructor(private readonly userId: string) {
    // 用户数据持久化目录
    this.userDataDir = path.join(process.cwd(), 'data', 'browser-profiles', userId);
    // 确保目录存在
    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }
  }

  /* ========== 浏览器生命周期 ========== */

  private async ensureBrowser(): Promise<void> {
    // 持久化上下文模式下检查 context，CDP 模式下检查 browser
    if (this.context && !USE_VNC) return;
    if (this.browser && this.browser.isConnected()) return;

    if (USE_VNC) {
      // noVNC 模式：通过 CDP 连接外部 Chrome 实例
      console.log(`[BrowserManager] 正在通过 CDP 连接 Chrome: ${CDP_URL}`);
      try {
        this.browser = await (await getChromium()).connectOverCDP(CDP_URL);
        // CDP 连接使用 Chrome 自带的 context
        this.context = this.browser.contexts()[0] || await this.browser.newContext();

        // 清理多余标签页，只保留第一个（确保 VNC 显示的就是 Agent 操作的页面）
        const allPages = this.context.pages();
        if (allPages.length > 1) {
          for (let i = allPages.length - 1; i > 0; i--) {
            try { await allPages[i].close(); } catch {}
          }
        }

        this.page = this.context.pages()[0] || await this.context.newPage();

        // 确保该标签页在 VNC 中可见
        try { await this.page.bringToFront(); } catch {}

        this.setupDialogHandlers();

        // 隐藏自动化特征
        await this.context.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
          // @ts-ignore
          window.chrome = { runtime: {} };
          Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
          Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
        });

        this.browser.on('disconnected', () => {
          console.log('[BrowserManager] CDP 连接断开，下次操作时重连');
          this.browser = null;
          this.context = null;
          this.page = null;
        });

        console.log('[BrowserManager] CDP 连接成功 (noVNC 模式)');
      } catch (error: any) {
        console.error(`[BrowserManager] CDP 连接失败: ${error.message}，回退到 headless 模式`);
        await this.launchHeadless();
      }
    } else {
      // 原始 headless 模式
      await this.launchHeadless();
    }
  }

  /** headless 模式启动（回退方案），使用 storageState 持久化 Cookie */
  private async launchHeadless(): Promise<void> {
    console.log(`[BrowserManager] 正在启动 Chromium (headless) [用户: ${this.userId}]...`);

    // 启动浏览器
    this.browser = await (await getChromium()).launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800',
      ],
    });

    // 加载已保存的 storageState（Cookie/LocalStorage）
    const storageStatePath = path.join(this.userDataDir, 'storage-state.json');
    let storageState: any = {};
    if (fs.existsSync(storageStatePath)) {
      try {
        storageState = JSON.parse(fs.readFileSync(storageStatePath, 'utf-8'));
        console.log(`[BrowserManager] 已加载用户 ${this.userId} 的会话状态`);
      } catch (e) {
        console.warn(`[BrowserManager] 加载 storageState 失败，使用空状态`);
      }
    }

    // 创建带 storageState 的上下文
    this.context = await this.browser.newContext({
      storageState,
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

    // 隐藏自动化特征
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      // @ts-ignore
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
    });

    this.page = await this.context.newPage();
    this.setupDialogHandlers();

    // 页面加载时自动注入脚本
    this.page.on('load', () => this.injectScript());

    // 定期保存 storageState（每60秒）
    this._saveInterval = setInterval(async () => {
      try {
        if (this.context) {
          const state = await this.context.storageState();
          fs.writeFileSync(storageStatePath, JSON.stringify(state, null, 2));
        }
      } catch (e) {
        // 忽略保存失败
      }
    }, 60000);

    console.log(`[BrowserManager] Chromium 已启动 (1280x800, profile: ${this.userDataDir})`);
  }

  /** 方案三：注入脚本到当前页面 */
  private async injectScript(): Promise<void> {
    try {
      const page = await this.getPage();
      await page.evaluate(INJECT_SCRIPT);
    } catch (e: any) {
      // 某些页面（如 about:blank）可能无法注入，忽略
    }
  }

  /** 自动处理原生弹窗 (alert/confirm/prompt) */
  private setupDialogHandlers(): void {
    if (!this.page) return;
    
    this.page.on('dialog', async (dialog) => {
      console.log(`[BrowserManager] 捕获弹窗: ${dialog.type()} - "${dialog.message()}"`);
      try {
        switch (dialog.type()) {
          case 'alert':
            await dialog.accept();
            console.log('[BrowserManager] ✓ 自动接受 alert');
            break;
          case 'confirm':
            await dialog.accept(); // 默认点确定
            console.log('[BrowserManager] ✓ 自动接受 confirm');
            break;
          case 'prompt':
            await dialog.accept(''); // 默认提交空值
            console.log('[BrowserManager] ✓ 自动接受 prompt (空值)');
            break;
          case 'beforeunload':
            await dialog.accept();
            break;
        }
      } catch (error: any) {
        console.warn(`[BrowserManager] 弹窗处理失败: ${error.message}`);
      }
    });
  }

  async getPage(): Promise<any> {
    try {
      await this.ensureBrowser();
      if (!this.page || (this.page.isClosed && this.page.isClosed())) {
        this.page = await this.context!.newPage();
      }
      // 确保 VNC 显示的是 Agent 正在操作的标签页
      try { await this.page.bringToFront(); } catch {}
      return this.page!;
    } catch (error) {
      console.error('[BrowserManager] 获取页面失败:', error);
      throw error;
    }
  }

  /* ========== 核心操作（全部拟人化） ========== */

  /**
   * 导航到指定 URL
   */
  async navigate(url: string): Promise<{ url: string; title: string }> {
    const page = await this.getPage();
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    console.log(`[BrowserManager] 导航到: ${fullUrl}`);

    // 权限检查
    const permCheck = permissionController.isUrlAllowed(fullUrl);
    if (!permCheck.allowed) {
      console.warn(`[BrowserManager] URL 被权限控制器拦截: ${permCheck.reason}`);
      // 不阻止导航，但记录警告（白名单为空时允许所有域名）
    }

    try {
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (navError: any) {
      // 导航失败（超时、网络错误等）
      console.warn(`[BrowserManager] 导航失败: ${navError.message}`);

      // 被墙网站自动回退到国内替代
      const blockedSites: Record<string, string> = {
        'www.google.com': 'https://www.baidu.com',
        'google.com': 'https://www.baidu.com',
        'www.google.com.hk': 'https://www.baidu.com',
        'www.youtube.com': 'https://www.bilibili.com',
        'youtube.com': 'https://www.bilibili.com',
        'www.facebook.com': 'https://www.weibo.com',
        'facebook.com': 'https://www.weibo.com',
        'www.twitter.com': 'https://www.weibo.com',
        'twitter.com': 'https://www.weibo.com',
        'www.x.com': 'https://www.weibo.com',
        'x.com': 'https://www.weibo.com',
        'www.instagram.com': 'https://www.xiaohongshu.com',
        'instagram.com': 'https://www.xiaohongshu.com',
        'chat.openai.com': 'https://www.doubao.com',
        'chatgpt.com': 'https://www.doubao.com',
      };

      let fallbackUrl: string | null = null;
      for (const [blocked, fallback] of Object.entries(blockedSites)) {
        if (fullUrl.includes(blocked)) {
          fallbackUrl = fallback;
          break;
        }
      }

      if (fallbackUrl) {
        console.log(`[BrowserManager] 检测到被墙网站，自动回退到: ${fallbackUrl}`);
        try {
          await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (fallbackError: any) {
          throw new Error(`导航失败: ${fullUrl} 和回退 ${fallbackUrl} 均无法访问`);
        }
      } else {
        throw new Error(`导航失败: ${fullUrl} - ${navError.message}`);
      }
    }

    // 模拟人类：页面加载后等待 JS 渲染完成
    await humanDelay(1000, 2000);
    // 额外等待网络空闲（确保动态内容加载）
    try {
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    } catch {}

    const finalUrl = page.url();
    const title = await page.title();
    console.log(`[BrowserManager] 导航完成: ${title}`);
    return { url: finalUrl, title };
  }

  /**
   * 截图
   */
  async screenshot(): Promise<string> {
    try {
      const page = await this.getPage();
      const buffer = await page.screenshot({ type: 'png', fullPage: false });
      return buffer.toString('base64');
    } catch (error) {
      console.error('[BrowserManager] 截图失败:', error);
      // 返回一个空白的base64图片，避免前端出错
      return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    }
  }

  /**
   * CDP Screencast：实时屏幕录制（30fps+ 流畅画面）
   * 通过 Chrome DevTools Protocol 的 Page.startScreencast 实时推送帧
   * @param onFrame 每帧回调，参数为 base64 JPEG 数据
   * @returns 停止函数
   */
  async startScreencast(onFrame: (frameData: string) => void): Promise<() => void> {
    const page = await this.getPage();
    const client = await page.context().newCDPSession(page);
    let stopped = false;

    // 监听 screencast 帧
    client.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      if (stopped) return;
      // data 是 base64 编码的 JPEG
      onFrame(data);
      // 必须确认帧，否则 Chrome 会停止推送
      try {
        await client.send('Page.screencastFrameAck', { sessionId });
      } catch {}
    });

    // 启动 screencast
    await client.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 60,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 1, // 每帧都推送
    });

    console.log('[BrowserManager] Screencast 已启动 (实时画面)');

    // 返回停止函数
    return async () => {
      stopped = true;
      try {
        await client.send('Page.stopScreencast');
        await client.detach();
      } catch {}
      console.log('[BrowserManager] Screencast 已停止');
    };
  }

  /**
   * 模拟真人鼠标点击
   * 流程：查找元素 → 滚动到可见 → 鼠标移动到元素 → 短暂停顿 → 点击
   */
  async click(selector: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`[BrowserManager] 点击: "${selector}"`);
      const page = await this.getPage();

      // ---- 策略1：Playwright locator 精确文本匹配 ----
      try {
        // 尝试 getByText（精确匹配可见文本）
        const textLocator = page.getByText(selector, { exact: true }).first();
        await textLocator.scrollIntoViewIfNeeded({ timeout: 2000 });
        await textLocator.click({ timeout: 3000 });
        const tag = await textLocator.evaluate((el: Element) => el.tagName);
        console.log(`[BrowserManager] ✓ Playwright getByText 点击成功: ${tag} "${selector}"`);
        // 处理新标签页
        await this.handleNewTab(page);
        return { success: true, message: `已点击 ${tag}: "${selector}"` };
      } catch {}

      // ---- 策略2：Playwright locator 模糊文本匹配 ----
      try {
        const textLocator = page.getByText(selector, { exact: false }).first();
        await textLocator.scrollIntoViewIfNeeded({ timeout: 2000 });
        await textLocator.click({ timeout: 3000 });
        const tag = await textLocator.evaluate((el: Element) => el.tagName);
        console.log(`[BrowserManager] ✓ Playwright getByText(模糊) 点击成功: ${tag} "${selector}"`);
        await this.handleNewTab(page);
        return { success: true, message: `已点击 ${tag}: "${selector}"` };
      } catch {}

      // ---- 策略3：Playwright getByRole / getByPlaceholderText / getByLabel ----
      try {
        // 尝试 role=button/link
        for (const role of ['button', 'link'] as const) {
          try {
            const roleLocator = page.getByRole(role, { name: selector }).first();
            await roleLocator.scrollIntoViewIfNeeded({ timeout: 1500 });
            await roleLocator.click({ timeout: 2000 });
            console.log(`[BrowserManager] ✓ Playwright getByRole(${role}) 点击成功: "${selector}"`);
            await this.handleNewTab(page);
            return { success: true, message: `已点击 ${role}: "${selector}"` };
          } catch {}
        }
      } catch {}

      // ---- 策略4：CSS 选择器（#id, .class, [attr]） ----
      if (selector.startsWith('#') || selector.startsWith('.') || selector.startsWith('[') || selector.includes('=')) {
        try {
          const cssLocator = page.locator(selector).first();
          await cssLocator.scrollIntoViewIfNeeded({ timeout: 2000 });
          await cssLocator.click({ timeout: 3000 });
          console.log(`[BrowserManager] ✓ Playwright CSS 选择器点击成功: ${selector}`);
          await this.handleNewTab(page);
          return { success: true, message: `已点击: ${selector}` };
        } catch {}
      }

      // ---- 策略5：aria-label / title / placeholder 匹配 ----
      try {
        const ariaLocator = page.locator(`[aria-label="${selector}"], [title="${selector}"], [placeholder="${selector}"]`).first();
        await ariaLocator.scrollIntoViewIfNeeded({ timeout: 2000 });
        await ariaLocator.click({ timeout: 3000 });
        console.log(`[BrowserManager] ✓ Playwright aria/title/placeholder 点击成功: "${selector}"`);
        await this.handleNewTab(page);
        return { success: true, message: `已点击: "${selector}"` };
      } catch {}

      // ---- 策略6：JS 回退 - 查找包含文字的元素并用 Playwright 点击 ----
      try {
        const elementHandle = await page.evaluateHandle((text) => {
          const candidates = document.querySelectorAll(
            'a, button, span, div, p, label, li, [role="button"], input[type="submit"], input[type="button"], img, svg, [aria-label], [title]'
          );
          for (const el of candidates) {
            const elText = el.innerText?.trim() || '';
            const ariaLabel = el.getAttribute('aria-label')?.trim() || '';
            const titleAttr = el.getAttribute('title')?.trim() || '';
            const combined = [elText, ariaLabel, titleAttr].join(' ');
            if (combined.includes(text)) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                const style = window.getComputedStyle(el);
                if (style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0) {
                  return el;
                }
              }
            }
          }
          return null;
        }, selector);

        if (elementHandle && elementHandle.asElement()) {
          const locator = page.locator(elementHandle.asElement()!);
          await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
          await locator.click({ timeout: 3000 });
          const tag = await locator.evaluate((el: Element) => el.tagName);
          console.log(`[BrowserManager] ✓ Playwright JS回退点击成功: ${tag} "${selector}"`);
          await this.handleNewTab(page);
          return { success: true, message: `已点击 ${tag}: "${selector}"` };
        }
      } catch {}

      return { success: false, message: `未找到元素: "${selector}"` };
    } catch (error: any) {
      return { success: false, message: `点击失败: ${error.message}` };
    }
  }

  /** 处理新标签页：如果链接在新标签页打开，自动切换 */
  private async handleNewTab(currentPage: any): Promise<void> {
    await humanDelay(500, 1000);
    const pagesAfter = this.context?.pages?.() || [];
    if (pagesAfter.length > 1) {
      const newPage = pagesAfter[pagesAfter.length - 1];
      console.log(`[BrowserManager] 检测到新标签页已打开，自动切换: ${newPage.url()}`);
      try { await currentPage.close(); } catch {}
      this.page = newPage;
      try {
        await newPage.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      } catch {}
    }
  }

  /**
   * 方案三终极版：通过注入脚本在浏览器上下文内获取元素并点击
   * 不依赖外部坐标换算，天然兼容滚动/缩放/动态渲染/ShadowDOM
   * @param x 前端截图上的点击 X 坐标
   * @param y 前端截图上的点击 Y 坐标
   * @param displayWidth 前端截图显示宽度（用于缩放到视口坐标）
   * @param displayHeight 前端截图显示高度
   */
  async clickAtV3(x: number, y: number, displayWidth?: number, displayHeight?: number): Promise<{ success: boolean; message: string; elementInfo?: any }> {
    try {
      const page = await this.getPage();
      const viewSize = await page.viewportSize();
      const realWidth = viewSize?.width || 1280;
      const realHeight = viewSize?.height || 800;

      // 缩放换算：前端截图坐标 → 浏览器视口坐标
      let vpX = x;
      let vpY = y;
      if (displayWidth && displayHeight) {
        vpX = (x / displayWidth) * realWidth;
        vpY = (y / displayHeight) * realHeight;
      }

      // 确保脚本已注入
      await this.injectScript();

      // 通过注入脚本在浏览器上下文内获取元素（天然准确）
      const elementInfo = await page.evaluate(({ px, py }) => {
        return window.__yinxinGetElementAtPoint(px, py);
      }, { px: vpX, py: vpY });

      if (!elementInfo) {
        return { success: false, message: `坐标(${Math.round(x)},${Math.round(y)})处没有可点击元素` };
      }

      console.log(`[BrowserManager V3] 命中元素: <${elementInfo.tag}> "${elementInfo.text || elementInfo.ariaLabel || elementInfo.placeholder}" 交互=${elementInfo.isInteractive}`);

      // 通过注入脚本在浏览器上下文内执行点击（原生事件链）
      const clickResult = await page.evaluate(({ px, py }) => {
        return window.__yinxinClickAt(px, py);
      }, { px: vpX, py: vpY });

      if (!clickResult.success) {
        return { success: false, message: clickResult.message };
      }

      await humanDelay(300, 600);

      return {
        success: true,
        message: `点击了 <${elementInfo.tag}> "${elementInfo.text || elementInfo.ariaLabel || elementInfo.placeholder || elementInfo.href}"`,
        elementInfo,
      };
    } catch (error: any) {
      return { success: false, message: `V3坐标点击失败: ${error.message}` };
    }
  }

  /**
   * 方案三：通过注入脚本在焦点元素输入文字
   */
  async typeAtFocusV3(text: string): Promise<{ success: boolean; message: string }> {
    try {
      const page = await this.getPage();
      await this.injectScript();

      const result = await page.evaluate((t) => {
        return window.__yinxinTypeAtFocus(t);
      }, text);

      return result;
    } catch (error: any) {
      return { success: false, message: `V3焦点输入失败: ${error.message}` };
    }
  }

  /**
   * 方案三：获取注入脚本维护的页面状态
   */
  async getPageStateV3(): Promise<{ scrollX: number; scrollY: number; viewportWidth: number; viewportHeight: number; pageWidth: number; pageHeight: number }> {
    const page = await this.getPage();
    await this.injectScript();
    return await page.evaluate(() => window.__yinxinGetState());
  }

  // ==================== CDP 原生操控通道（人工操作专用） ====================

  /**
   * CDP 原生鼠标点击：通过 Input.dispatchMouseEvent 直接下发系统级点击事件
   * 不经过 DOM 元素查找、不经过选择器，和真人手动操作完全一致
   * @param x 视口 X 坐标
   * @param y 视口 Y 坐标
   * @param displayWidth 前端画面显示宽度（缩放换算用）
   * @param displayHeight 前端画面显示高度
   */
  async cdpClick(x: number, y: number, displayWidth?: number, displayHeight?: number): Promise<{ success: boolean; message: string }> {
    try {
      const page = await this.getPage();
      const viewSize = await page.viewportSize();
      const realWidth = viewSize?.width || 1280;
      const realHeight = viewSize?.height || 800;

      // 缩放换算：前端画面坐标 → 浏览器真实视口坐标
      let realX = x;
      let realY = y;
      if (displayWidth && displayHeight) {
        realX = (x / displayWidth) * realWidth;
        realY = (y / displayHeight) * realHeight;
      }

      // 获取 CDP Session
      const client = await page.context().newCDPSession(page);

      // 完整鼠标事件链：moved → pressed → released → clicked
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: realX, y: realY,
      });
      await humanDelay(20, 50);
      await client.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: realX, y: realY,
        button: 'left', clickCount: 1,
      });
      await humanDelay(40, 100);
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: realX, y: realY,
        button: 'left', clickCount: 1,
      });

      await client.detach();

      console.log(`[BrowserManager CDP] 原生点击: (${Math.round(realX)}, ${Math.round(realY)})`);
      return { success: true, message: `CDP 原生点击 (${Math.round(x)}, ${Math.round(y)})` };
    } catch (error: any) {
      return { success: false, message: `CDP 点击失败: ${error.message}` };
    }
  }

  /**
   * CDP 原生键盘输入：通过 Input.dispatchKeyEvent 直接下发系统级按键事件
   * 支持文字输入和特殊按键（Enter/Tab/Escape/Backspace 等）
   * @param text 要输入的文字或按键名称
   */
  async cdpType(text: string): Promise<{ success: boolean; message: string }> {
    try {
      const page = await this.getPage();

      // 特殊按键：Enter/Tab/Esc 等用 Playwright（CDP dispatchKeyEvent 在 contenteditable 中会把按键名当文字）
      const specialKeys: Record<string, string> = {
        'Enter': 'Enter', 'Tab': 'Tab', 'Escape': 'Escape', 'Backspace': 'Backspace',
        'Delete': 'Delete', 'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown',
        'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
        'PageUp': 'PageUp', 'PageDown': 'PageDown', 'Home': 'Home', 'End': 'End',
        'F5': 'F5', 'F12': 'F12',
      };

      // 单个特殊按键：用 Playwright keyboard.press
      if (specialKeys[text]) {
        await page.keyboard.press(specialKeys[text]);
        console.log(`[BrowserManager] Playwright 按键: ${text}`);
        return { success: true, message: `按键完成: ${text}` };
      }

      // 检测是否包含中文/非ASCII字符（CDP dispatchKeyEvent 不支持 IME 输入）
      const hasNonAscii = /[^ -~]/.test(text);

      if (hasNonAscii) {
        // 中文等非ASCII字符：用 Playwright keyboard.type（走浏览器 IME 输入法）
        await page.keyboard.type(text, { delay: 30 + Math.random() * 50 });
        console.log(`[BrowserManager] Playwright IME 输入: "${text}"`);
        return { success: true, message: `IME 输入完成` };
      }

      // 纯英文：用 CDP 原生通道
      const client = await page.context().newCDPSession(page);

      for (const char of text) {
        const key = char.length === 1 ? char : char;
        const code = char.charCodeAt(0);
        await client.send('Input.dispatchKeyEvent', {
          type: 'keyDown', key, text: char, code: `Key${char.toUpperCase()}`,
          windowsVirtualKeyCode: code, nativeVirtualKeyCode: code,
        });
        await client.send('Input.dispatchKeyEvent', {
          type: 'char', key, text: char,
          windowsVirtualKeyCode: code, nativeVirtualKeyCode: code,
        });
        await client.send('Input.dispatchKeyEvent', {
          type: 'keyUp', key, code: `Key${char.toUpperCase()}`,
          windowsVirtualKeyCode: code, nativeVirtualKeyCode: code,
        });
        await humanDelay(10, 30);
      }

      await client.detach();
      console.log(`[BrowserManager CDP] 原生输入: "${text}"`);
      return { success: true, message: `CDP 原生输入完成` };
    } catch (error: any) {
      return { success: false, message: `CDP 输入失败: ${error.message}` };
    }
  }

  /**
   * CDP 原生滚轮：通过 Input.dispatchMouseEvent(type=mouseWheel) 直接下发系统级滚轮事件
   * @param x 滚轮位置 X 坐标（通常为视口中心）
   * @param y 滚轮位置 Y 坐标
   * @param deltaX 水平滚动量（正=右，负=左）
   * @param deltaY 垂直滚动量（正=下滚，负=上滚）
   * @param displayWidth 前端画面显示宽度
   * @param displayHeight 前端画面显示高度
   */
  async cdpScroll(x: number, y: number, deltaX: number, deltaY: number, displayWidth?: number, displayHeight?: number): Promise<{ success: boolean; message: string }> {
    try {
      const page = await this.getPage();
      const viewSize = await page.viewportSize();
      const realWidth = viewSize?.width || 1280;
      const realHeight = viewSize?.height || 800;

      let realX = x;
      let realY = y;
      if (displayWidth && displayHeight) {
        realX = (x / displayWidth) * realWidth;
        realY = (y / displayHeight) * realHeight;
      }

      const client = await page.context().newCDPSession(page);

      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: realX, y: realY,
        deltaX: deltaX * 120, // CDP 使用 120 为一个滚动单位
        deltaY: deltaY * 120,
      });

      await client.detach();

      console.log(`[BrowserManager CDP] 原生滚轮: (${Math.round(realX)},${Math.round(realY)}) Δ(${deltaX},${deltaY})`);
      return { success: true, message: `CDP 原生滚轮` };
    } catch (error: any) {
      return { success: false, message: `CDP 滚轮失败: ${error.message}` };
    }
  }

  /**
   * 在当前焦点元素输入文字（坐标点击输入框后使用，无需选择器）
   */
  async typeAtFocus(text: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`[BrowserManager] CDP 焦点输入: "${text}"`);
      await this.cdpType(text);
      return { success: true, message: `已输入: "${text}"` };
    } catch (error: any) {
      return { success: false, message: `焦点输入失败: ${error.message}` };
    }
  }

  /**
   * 模拟真人键盘输入（使用 Playwright 原生 API）
   */
  async type(selector: string, text: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`[BrowserManager] 输入到 "${selector}": "${text}"`);
      const page = await this.getPage();

      // ---- 用 Playwright locator 查找输入框 ----
      let inputLocator: any = null;

      // 策略1：特殊处理百度搜索框
      if (selector === 'wd') {
        inputLocator = page.locator('#kw, input[name="wd"], input[id="wd"]').first();
      }
      // 策略2：CSS 选择器
      else if (selector.startsWith('#') || selector.startsWith('.') || selector.startsWith('[') || selector.includes('=')) {
        inputLocator = page.locator(selector).first();
      }
      // 策略3：Playwright getByPlaceholder / getByLabel
      else {
        // 尝试 placeholder 精确匹配
        try {
          inputLocator = page.getByPlaceholder(selector, { exact: true }).first();
          await inputLocator.waitFor({ state: 'visible', timeout: 1000 });
        } catch {
          // 尝试 placeholder 模糊匹配
          try {
            inputLocator = page.getByPlaceholder(selector, { exact: false }).first();
            await inputLocator.waitFor({ state: 'visible', timeout: 1000 });
          } catch {
            // 尝试 label 关联
            try {
              inputLocator = page.getByLabel(selector).first();
              await inputLocator.waitFor({ state: 'visible', timeout: 1000 });
            } catch {
              // 回退：用 JS 查找
              inputLocator = null;
            }
          }
        }
      }

      // 策略4：JS 回退查找
      if (!inputLocator) {
        const handle = await page.evaluateHandle((sel) => {
          const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="image"]), textarea, [contenteditable="true"]');
          for (const input of inputs) {
            const el = input as HTMLInputElement;
            if (
              el.placeholder === sel || el.name === sel || el.id === sel ||
              el.getAttribute('aria-label') === sel || el.getAttribute('title') === sel
            ) {
              if (el.getBoundingClientRect().width > 0) return el;
            }
          }
          // 模糊匹配
          for (const input of inputs) {
            const el = input as HTMLInputElement;
            const combined = [el.placeholder, el.name, el.id, el.getAttribute('aria-label'), el.getAttribute('title')].filter(Boolean).join(' ');
            if (combined.includes(sel)) {
              if (el.getBoundingClientRect().width > 0) return el;
            }
          }
          // 回退：第一个可见输入框
          for (const input of inputs) {
            const el = input as HTMLElement;
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const style = window.getComputedStyle(el);
              if (style.display !== 'none' && style.visibility !== 'hidden') return el;
            }
          }
          return null;
        }, selector);

        if (handle && handle.asElement()) {
          inputLocator = page.locator(handle.asElement()!);
        }
      }

      if (!inputLocator) {
        return { success: false, message: `未找到输入框: "${selector}"` };
      }

      // ---- 用 Playwright fill 输入文本（force 模式绕过可操作性检查） ----
      try {
        await inputLocator.scrollIntoViewIfNeeded({ timeout: 2000 });
        await inputLocator.click({ timeout: 3000, force: true });
        await humanDelay(100, 300);
        // 先清空，再用 fill（force 模式直接设置 value，绕过 React 事件检查）
        await inputLocator.fill('', { force: true });
        await inputLocator.fill(text, { force: true });
        // 触发 input/change 事件确保框架感知
        await inputLocator.dispatchEvent('input');
        await inputLocator.dispatchEvent('change');
        console.log(`[BrowserManager] ✓ Playwright fill(force) 完成: "${text}"`);
      } catch (fillErr: any) {
        // 回退：用 keyboard.insertText
        console.log(`[BrowserManager] fill 失败，回退到 insertText: ${fillErr.message}`);
        try {
          await inputLocator.click({ timeout: 2000, force: true });
          await page.keyboard.press('Control+a');
          await page.keyboard.press('Backspace');
          await page.keyboard.insertText(text);
          console.log(`[BrowserManager] ✓ Playwright insertText 完成: "${text}"`);
        } catch (insertErr: any) {
          // 最终回退：JS 注入
          console.log(`[BrowserManager] insertText 失败，回退到 JS 注入: ${insertErr.message}`);
          await page.evaluate((txt) => {
            const active = document.activeElement as HTMLInputElement;
            if (!active) return;
            if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') {
              // 使用 React 兼容的方式设置值
              const nativeSetter = Object.getOwnPropertyDescriptor(
                active.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
                'value'
              )?.set;
              if (nativeSetter) {
                nativeSetter.call(active, txt);
              } else {
                (active as any).value = txt;
              }
            } else {
              active.innerText = txt;
            }
            active.dispatchEvent(new Event('input', { bubbles: true }));
            active.dispatchEvent(new Event('change', { bubbles: true }));
            active.dispatchEvent(new Event('compositionend', { bubbles: true }));
          }, text);
          console.log(`[BrowserManager] ✓ JS 注入输入完成: "${text}"`);
        }
      }

      return { success: true, message: `已输入: "${text}"` };
    } catch (error: any) {
      return { success: false, message: `输入失败: ${error.message}` };
    }
  }

  /**
   * 模拟真人按键
   */
  async press(key: string): Promise<{ success: boolean }> {
    try {
      await humanDelay(100, 300);
      const page = await this.getPage();

      // 全部用 Playwright keyboard.press（走浏览器原生事件，兼容所有框架）
      await page.keyboard.press(key);
      await humanDelay(200, 400);
      console.log(`[BrowserManager] ✓ Playwright 按键: ${key}`);
      return { success: true };
    } catch (error: any) {
      console.error(`[BrowserManager] 按键失败: ${key}`, error.message);
      return { success: false };
    }
  }

  /**
   * 模拟真人滚动（带惯性）
   */
  async scroll(direction: 'up' | 'down', amount: number = 500): Promise<{ success: boolean }> {
    try {
      const page = await this.getPage();
      const delta = direction === 'down' ? amount : -amount;

      // 用 Playwright mouse.wheel 滚动（原生浏览器滚动事件）
      const steps = 5 + Math.floor(Math.random() * 5);
      const stepSize = delta / steps;
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, stepSize);
        await humanDelay(30, 80);
      }

      console.log(`[BrowserManager] ✓ Playwright 滚动: ${direction} ${amount}px`);
      return { success: true };
    } catch (error: any) {
      return { success: false };
    }
  }

  /**
   * 模拟真人选择文本（鼠标拖选）
   */
  async selectText(selector: string): Promise<{ success: boolean; message: string }> {
    try {
      const page = await this.getPage();
      const target = await page.evaluate((text) => {
        const candidates = document.querySelectorAll('span, div, p, a, label, td, li');
        for (const el of candidates) {
          if (el.innerText?.trim() === text) {
            const rect = el.getBoundingClientRect();
            return { x: rect.x, y: rect.y + rect.height / 2, w: rect.width, h: rect.height };
          }
        }
        return null;
      }, selector);

      if (!target) return { success: false, message: `未找到文本: "${selector}"` };

      // 从文本起始拖到末尾
      await page.mouse.move(jitter(target.x + 2), jitter(target.y));
      await humanDelay(100, 200);
      await page.mouse.down();
      await humanDelay(50, 100);
      await page.mouse.move(jitter(target.x + target.w - 2), jitter(target.y), { steps: 8 });
      await humanDelay(50, 100);
      await page.mouse.up();

      console.log(`[BrowserManager] ✓ 已选择文本: "${selector}"`);
      return { success: true, message: `已选择: "${selector}"` };
    } catch (error: any) {
      return { success: false, message: `选择失败: ${error.message}` };
    }
  }

  /**
   * 模拟 Ctrl+C 复制
   */
  async copy(): Promise<{ success: boolean }> {
    try {
      const page = await this.getPage();
      await humanDelay(100, 200);
      await page.keyboard.press('Control+c');
      console.log('[BrowserManager] ✓ Ctrl+C 复制');
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * 模拟 Ctrl+V 粘贴
   */
  async paste(): Promise<{ success: boolean }> {
    try {
      const page = await this.getPage();
      await humanDelay(100, 200);
      await page.keyboard.press('Control+v');
      console.log('[BrowserManager] ✓ Ctrl+V 粘贴');
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * 模拟 Ctrl+A 全选
   */
  async selectAll(): Promise<{ success: boolean }> {
    try {
      const page = await this.getPage();
      await humanDelay(100, 200);
      await page.keyboard.press('Control+a');
      console.log('[BrowserManager] ✓ Ctrl+A 全选');
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * 双击（选中单词/打开链接）
   */
  async doubleClick(selector: string): Promise<{ success: boolean; message: string }> {
    try {
      const page = await this.getPage();
      const target = await page.evaluate((text) => {
        const candidates = document.querySelectorAll('span, div, p, a, label, td, li');
        for (const el of candidates) {
          if (el.innerText?.trim()?.includes(text)) {
            const rect = el.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          }
        }
        return null;
      }, selector);

      if (!target) return { success: false, message: `未找到: "${selector}"` };

      await page.mouse.move(jitter(target.x), jitter(target.y));
      await humanDelay(100, 200);
      await page.mouse.dblclick(target.x, target.y);

      console.log(`[BrowserManager] ✓ 双击: "${selector}"`);
      return { success: true, message: `已双击: "${selector}"` };
    } catch (error: any) {
      return { success: false, message: `双击失败: ${error.message}` };
    }
  }

  /**
   * 右键点击
   */
  async rightClick(selector: string): Promise<{ success: boolean; message: string }> {
    try {
      const page = await this.getPage();
      const target = await page.evaluate((text) => {
        const candidates = document.querySelectorAll('span, div, p, a, label, td, li, img');
        for (const el of candidates) {
          const elText = el.innerText?.trim() || el.getAttribute('alt') || '';
          if (elText.includes(text)) {
            const rect = el.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          }
        }
        return null;
      }, selector);

      if (!target) return { success: false, message: `未找到: "${selector}"` };

      await page.mouse.move(jitter(target.x), jitter(target.y));
      await humanDelay(100, 200);
      await page.mouse.click(target.x, target.y, { button: 'right' });

      console.log(`[BrowserManager] ✓ 右键: "${selector}"`);
      return { success: true, message: `已右键: "${selector}"` };
    } catch (error: any) {
      return { success: false, message: `右键失败: ${error.message}` };
    }
  }

  /**
   * 鼠标悬停
   */
  async hover(selector: string): Promise<{ success: boolean; message: string }> {
    try {
      const page = await this.getPage();
      const target = await page.evaluate((text) => {
        const candidates = document.querySelectorAll('a, button, span, div, li, [role="button"]');
        for (const el of candidates) {
          if (el.innerText?.trim()?.includes(text)) {
            const rect = el.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          }
        }
        return null;
      }, selector);

      if (!target) return { success: false, message: `未找到: "${selector}"` };

      await page.mouse.move(jitter(target.x), jitter(target.y), { steps: 8 });
      await humanDelay(500, 1000);

      console.log(`[BrowserManager] ✓ 悬停: "${selector}"`);
      return { success: true, message: `已悬停: "${selector}"` };
    } catch (error: any) {
      return { success: false, message: `悬停失败: ${error.message}` };
    }
  }

  /* ========== 页面信息获取 ========== */

  async getPageContent(): Promise<string> {
    const page = await this.getPage();
    return getPageContentFn(page);
  }

  async getPageSnapshot(): Promise<{
    title: string; url: string;
    forms: any[]; links: any[]; buttons: any[]; inputs: any[];
  }> {
    const page = await this.getPage();
    return getPageSnapshotFn(page);
  }

  async waitForSelector(selector: string, timeout: number = 10000): Promise<boolean> {
    const page = await this.getPage();
    return waitForSelectorFn(page, selector, timeout);
  }

  // C3 修复：executeScript 添加安全白名单限制
  private static readonly SCRIPT_WHITELIST = [
    'window.scrollTo', 'window.scrollBy', 'window.scroll',
    'document.querySelector', 'document.querySelectorAll',
    'document.getElementById', 'document.getElementsByClassName',
    'document.getElementsByTagName', 'document.getElementsByName',
    'getComputedStyle', 'getBoundingClientRect',
    'window.getSelection',
  ];

  async executeScript(script: string): Promise<any> {
    const page = await this.getPage();
    return executeScriptFn(page, script);
  }

  /* ========== 多标签页管理 ========== */

  /** 获取所有标签页 */
  async getTabs(): Promise<{ id: string; url: string; title: string }[]> {
    await this.ensureBrowser();
    if (!this.context) return [];
    const pages = this.context.pages();
    return pages.map((p, i) => ({
      id: `tab_${i}`,
      url: p.url(),
      title: p.isClosed() ? '(closed)' : (p.title() || '(untitled)'),
    }));
  }

  /** 切换到指定标签页 */
  async switchTab(index: number): Promise<boolean> {
    await this.ensureBrowser();
    if (!this.context) return false;
    const pages = this.context.pages();
    if (index >= 0 && index < pages.length) {
      this.page = pages[index];
      console.log(`[BrowserManager] ✓ 切换到标签页 ${index}: ${this.page.url()}`);
      return true;
    }
    return false;
  }

  /** 新建标签页 */
  async newTab(url?: string): Promise<boolean> {
    await this.ensureBrowser();
    if (!this.context) return false;
    const newPage = await this.context.newPage();
    if (url) {
      await newPage.goto(url.startsWith('http') ? url : `https://${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    this.page = newPage;
    console.log(`[BrowserManager] ✓ 新建标签页: ${url || 'about:blank'}`);
    return true;
  }

  /** 关闭当前标签页 */
  async closeTab(index?: number): Promise<boolean> {
    await this.ensureBrowser();
    if (!this.context) return false;
    const pages = this.context.pages();
    const targetIndex = index ?? pages.indexOf(this.page!);
    if (targetIndex >= 0 && targetIndex < pages.length && pages.length > 1) {
      await pages[targetIndex].close().catch(() => {});
      this.page = this.context.pages()[0] || null;
      console.log(`[BrowserManager] ✓ 关闭标签页 ${targetIndex}`);
      return true;
    }
    return false;
  }

  /**
   * 选择下拉框选项（通过可见文本匹配）
   */
  async selectOption(selector: string, value: string): Promise<{ success: boolean; message: string }> {
    try {
      const page = await this.getPage();
      console.log(`[BrowserManager] 选择下拉框 "${selector}" → "${value}"`);

      // 先找到 select 元素并点击展开
      const selectTarget = await page.evaluate((sel) => {
        const selects = document.querySelectorAll('select');
        for (const s of selects) {
          const label = s.id || s.name || s.getAttribute('aria-label') || '';
          if (label.includes(sel) || sel.includes(label)) {
            const rect = s.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, found: true };
          }
        }
        return { found: false };
      }, selector);

      if (!selectTarget.found) {
        return { success: false, message: `未找到下拉框: "${selector}"` };
      }

      // 点击展开下拉框
      await page.mouse.move(jitter(selectTarget.x), jitter(selectTarget.y));
      await humanDelay(200, 400);
      await page.mouse.down();
      await humanDelay(50, 100);
      await page.mouse.up();
      await humanDelay(500, 800);

      // 通过 Playwright selectOption 选择（最可靠）
      try {
        const selectEl = page.locator('select').first();
        await selectEl.selectOption({ label: value });
        console.log(`[BrowserManager] ✓ 已选择: "${value}"`);
        return { success: true, message: `已选择: "${value}"` };
      } catch {
        // 回退：通过点击选项文本
        const optionTarget = await page.evaluate((text) => {
          const options = document.querySelectorAll('option, [role="option"], [role="listbox"] li');
          for (const opt of options) {
            if (opt.textContent?.trim().includes(text)) {
              const rect = opt.getBoundingClientRect();
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }
          }
          return null;
        }, value);

        if (optionTarget) {
          await page.mouse.move(jitter(optionTarget.x), jitter(optionTarget.y));
          await humanDelay(100, 200);
          await page.mouse.down();
          await humanDelay(50, 100);
          await page.mouse.up();
          console.log(`[BrowserManager] ✓ 已选择(点击): "${value}"`);
          return { success: true, message: `已选择: "${value}"` };
        }
        return { success: false, message: `未找到选项: "${value}"` };
      }
    } catch (error: any) {
      return { success: false, message: `选择失败: ${error.message}` };
    }
  }

  /**
   * 上传文件
   */
  async uploadFile(selector: string, filePath: string): Promise<{ success: boolean; message: string }> {
    try {
      const page = await this.getPage();
      console.log(`[BrowserManager] 上传文件到 "${selector}": ${filePath}`);

      const fileInput = await page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(filePath);
      await humanDelay(500, 1000);
      console.log(`[BrowserManager] ✓ 文件已上传: ${filePath}`);
      return { success: true, message: `已上传: ${filePath}` };
    } catch (error: any) {
      return { success: false, message: `上传失败: ${error.message}` };
    }
  }

  /* ========== Cookie 持久化 ========== */

  /** 保存当前 Cookie 到文件 */
  async saveCookies(domain?: string): Promise<string> {
    await this.ensureBrowser();
    if (!this.context) return '';
    const cookies = await this.context.cookies();
    const cookieDir = path.join(process.cwd(), 'data', 'cookies', this.userId);
    if (!fs.existsSync(cookieDir)) fs.mkdirSync(cookieDir, { recursive: true });
    
    const filename = domain ? `cookies_${domain.replace(/[^a-z0-9]/gi, '_')}.json` : 'cookies_default.json';
    const filepath = path.join(cookieDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(cookies, null, 2));
    console.log(`[BrowserManager] ✓ Cookie 已保存: ${filename} (${cookies.length} 个)`);
    return filepath;
  }

  /** 从文件加载 Cookie */
  async loadCookies(domain?: string): Promise<number> {
    await this.ensureBrowser();
    if (!this.context) return 0;
    
    const filename = domain ? `cookies_${domain.replace(/[^a-z0-9]/gi, '_')}.json` : 'cookies_default.json';
    const filepath = path.join(process.cwd(), 'data', 'cookies', this.userId, filename);
    
    if (!fs.existsSync(filepath)) return 0;
    
    const cookies = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    await this.context.addCookies(cookies);
    console.log(`[BrowserManager] ✓ Cookie 已加载: ${filename} (${cookies.length} 个)`);
    return cookies.length;
  }

  /* ========== 浏览器控制 ========== */

  /**
   * 刷新当前页面
   */
  async reload(): Promise<{ url: string; title: string }> {
    const page = await this.getPage();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(1000, 2000);
    try {
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    } catch {}
    const finalUrl = page.url();
    const title = await page.title();
    console.log(`[BrowserManager] 页面已刷新: ${title}`);
    return { url: finalUrl, title };
  }

  /**
   * 下载文件
   */
  async downloadFile(downloadUrl?: string): Promise<{ filePath: string; fileName: string; size: number }> {
    const page = await this.getPage();
    const downloadDir = path.join(process.cwd(), 'data', 'downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    let download: any;
    if (downloadUrl) {
      // 通过创建隐藏链接触发下载
      [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60000 }),
        page.evaluate((url: string) => {
          const a = document.createElement('a');
          a.href = url;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, downloadUrl),
      ]);
    } else {
      // 等待页面触发的下载
      download = await page.waitForEvent('download', { timeout: 60000 });
    }

    const fileName = download.suggestedFilename();
    const filePath = path.join(downloadDir, fileName);
    await download.saveAs(filePath);

    const stats = fs.statSync(filePath);
    console.log(`[BrowserManager] 文件已下载: ${fileName} (${(stats.size / 1024).toFixed(1)} KB)`);
    return { filePath, fileName, size: stats.size };
  }

  /* ========== 浏览器配置持久化 ========== */

  async saveProfile(): Promise<void> {
    // 保存 storageState（Cookie/LocalStorage）到磁盘
    if (this._saveInterval) {
      clearInterval(this._saveInterval);
      this._saveInterval = null;
    }
    try {
      if (this.context) {
        const storageStatePath = path.join(this.userDataDir, 'storage-state.json');
        const state = await this.context.storageState();
        fs.writeFileSync(storageStatePath, JSON.stringify(state, null, 2));
        console.log(`[BrowserManager] 用户 ${this.userId} 的会话状态已保存到 ${storageStatePath}`);
      }
    } catch (e: any) {
      console.warn(`[BrowserManager] 保存会话状态失败: ${e.message}`);
    }
  }

  getProfileInfo(): { userId: string; profileDir: string; exists: boolean; size: number } {
    const exists = fs.existsSync(this.userDataDir);
    let size = 0;
    if (exists) {
      const stat = fs.statSync(this.userDataDir);
      size = stat.size;
    }
    return { userId: this.userId, profileDir: this.userDataDir, exists, size };
  }

  /* ========== 浏览器控制 ========== */

  async close(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) await this.page.close().catch(() => {});
      // 持久化上下文模式：直接关闭 context（它拥有浏览器实例）
      // CDP 模式：先关闭 context，再关闭 browser
      if (this.context) await this.context.close().catch(() => {});
      if (this.browser && this.browser.isConnected()) await this.browser.close().catch(() => {});
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }

  /* ========== 三层结构化页面快照（Phase 1.2） ========== */

  /**
   * 三层快照策略：
   * - Layer 1（结构摘要，~500 token）：URL + 标题 + 页面类型 + 登录状态 + 弹窗列表 + 表单字段列表 + 数据区域描述
   * - Layer 2（DOM 关键节点，~1000 token）：可交互元素列表 + 数据表格结构
   * - Layer 3（截图 base64）：仅在需要视觉理解时使用
   */
  async getPageSnapshotStructured(layer: 1 | 2 | 3): Promise<{
    layer: 1 | 2 | 3;
    summary: string;
    elements?: Array<{ type: string; tag: string; text: string; selector: string; attrs: Record<string, string> }>;
    tables?: Array<{ headers: string[]; rowCount: number; caption?: string }>;
    screenshot?: string;
  }> {
    const page = await this.getPage();
    return getPageSnapshotStructuredFn(page, layer, () => this.screenshot(), () => this.getBrowserInfo());
  }

  async getBrowserInfo(): Promise<{
    connected: boolean; hasPage: boolean; hasContext: boolean;
    url?: string; title?: string;
  }> {
    const connected = this.browser !== null && this.browser.isConnected ? this.browser.isConnected() : !!this.context;
    const hasContext = this.context !== null;
    const hasPage = this.page !== null && this.page.isClosed ? !this.page.isClosed() : false;
    let url: string | undefined;
    let title: string | undefined;
    if (hasPage && this.page) {
      try { url = this.page.url(); title = await this.page.title(); } catch {}
    }
    return { connected, hasPage, hasContext, url, title };
  }
}

export { BrowserManager };

// 向后兼容：提供一个默认的 browserManager 实例（用于 browser-control / browser API 路由）
export const browserManager = new BrowserManager('default');

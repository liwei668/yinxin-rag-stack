import { NextRequest, NextResponse } from 'next/server';
import { browserManagerFactory } from '@/services/agent/browserManagerFactory';
import { logger } from '../../../../src/lib/logger';

/** 从请求中获取 userId，默认 'default' */
function getUserId(request: NextRequest): string {
  // 优先从 query 参数获取（GET 请求）
  const { searchParams } = new URL(request.url);
  const queryUserId = searchParams.get('userId');
  if (queryUserId) return queryUserId;

  return 'default';
}

/** 从请求体中获取 userId，默认 'default' */
async function getUserIdFromBody(request: NextRequest): Promise<string> {
  try {
    const body = await request.json();
    return body.userId || 'default';
  } catch {
    return 'default';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId: bodyUserId } = body;
    const userId = bodyUserId || getUserId(request);

    let bm;
    try {
      bm = await browserManagerFactory.getManager(userId);
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `获取浏览器实例失败: ${e.message}` }, { status: 500 });
    }

    switch (action) {
      case 'navigate': {
        const { url } = body;
        if (!url) {
          return NextResponse.json({ success: false, error: '缺少 url 参数' }, { status: 400 });
        }
        const result = await bm.navigate(url);
        return NextResponse.json({ success: true, ...result });
      }

      case 'newTab': {
        // 新建标签页：在当前 context 中打开一个新 page
        const page = await bm.getPage();
        const newPage = await page.context().newPage();
        await newPage.goto('about:blank');
        return NextResponse.json({ success: true, message: '已新建标签页' });
      }

      case 'click': {
        const { selector } = body;
        if (!selector) {
          return NextResponse.json({ success: false, error: '缺少 selector 参数' }, { status: 400 });
        }
        const result = await bm.click(selector);
        return NextResponse.json(result);
      }

      // ==================== CDP 原生操控通道（AI + 人工统一通道） ====================

      case 'cdpClick': {
        const { x, y, displayWidth, displayHeight } = body;
        if (x === undefined || y === undefined) {
          return NextResponse.json({ success: false, error: '缺少 x 或 y 坐标参数' }, { status: 400 });
        }
        const result = await bm.cdpClick(
          Number(x), Number(y),
          displayWidth ? Number(displayWidth) : undefined,
          displayHeight ? Number(displayHeight) : undefined,
        );
        return NextResponse.json(result);
      }

      case 'cdpType': {
        const { text } = body;
        if (!text) {
          return NextResponse.json({ success: false, error: '缺少 text 参数' }, { status: 400 });
        }
        const result = await bm.cdpType(String(text));
        return NextResponse.json(result);
      }

      case 'cdpScroll': {
        const { x, y, deltaX, deltaY, displayWidth, displayHeight } = body;
        if (x === undefined || y === undefined || deltaY === undefined) {
          return NextResponse.json({ success: false, error: '缺少必要参数 (x, y, deltaY)' }, { status: 400 });
        }
        const result = await bm.cdpScroll(
          Number(x), Number(y),
          Number(deltaX || 0), Number(deltaY),
          displayWidth ? Number(displayWidth) : undefined,
          displayHeight ? Number(displayHeight) : undefined,
        );
        return NextResponse.json(result);
      }

      case 'type': {
        const { selector, text } = body;
        if (!selector || text === undefined) {
          return NextResponse.json({ success: false, error: '缺少 selector 或 text 参数' }, { status: 400 });
        }
        const result = await bm.type(selector, text);
        return NextResponse.json(result);
      }

      case 'press': {
        const { key } = body;
        if (!key) {
          return NextResponse.json({ success: false, error: '缺少 key 参数' }, { status: 400 });
        }
        const result = await bm.press(key);
        return NextResponse.json(result);
      }

      case 'scroll': {
        const { direction, amount } = body;
        if (!direction || !['up', 'down'].includes(direction)) {
          return NextResponse.json({ success: false, error: '缺少 direction 参数或值无效（up/down）' }, { status: 400 });
        }
        const result = await bm.scroll(direction, amount);
        return NextResponse.json(result);
      }

      case 'screenshot': {
        const base64 = await bm.screenshot();
        return NextResponse.json({
          success: true,
          screenshot: `data:image/png;base64,${base64}`,
        });
      }

      case 'content': {
        const content = await bm.getPageContent();
        const info = await bm.getBrowserInfo();
        return NextResponse.json({
          success: true,
          content,
          title: info.title,
          url: info.url,
        });
      }

      case 'snapshot': {
        const data = await bm.getPageSnapshot();
        return NextResponse.json({ success: true, data });
      }

      case 'close': {
        await browserManagerFactory.releaseManager(userId);
        return NextResponse.json({ success: true });
      }

      case 'double_click': {
        const { selector } = body;
        if (!selector) return NextResponse.json({ success: false, error: '缺少 selector' }, { status: 400 });
        const result = await bm.doubleClick(selector);
        return NextResponse.json(result);
      }

      case 'right_click': {
        const { selector } = body;
        if (!selector) return NextResponse.json({ success: false, error: '缺少 selector' }, { status: 400 });
        const result = await bm.rightClick(selector);
        return NextResponse.json(result);
      }

      case 'hover': {
        const { selector } = body;
        if (!selector) return NextResponse.json({ success: false, error: '缺少 selector' }, { status: 400 });
        const result = await bm.hover(selector);
        return NextResponse.json(result);
      }

      case 'select_text': {
        const { selector } = body;
        if (!selector) return NextResponse.json({ success: false, error: '缺少 selector' }, { status: 400 });
        const result = await bm.selectText(selector);
        return NextResponse.json(result);
      }

      case 'copy': {
        const result = await bm.copy();
        return NextResponse.json(result);
      }

      case 'paste': {
        const result = await bm.paste();
        return NextResponse.json(result);
      }

      case 'select_all': {
        const result = await bm.selectAll();
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ success: false, error: `未知操作: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    logger.error('SYSTEM', '[Browser API] POST 错误', { extra: { error: String(error) } });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const userId = getUserId(request);

    let bm;
    try {
      bm = await browserManagerFactory.getManager(userId);
    } catch (e: any) {
      return NextResponse.json({ success: false, error: `获取浏览器实例失败: ${e.message}` }, { status: 500 });
    }

    switch (action) {
      case 'screenshot': {
        // 返回 PNG 图片二进制流
        const page = await bm.getPage();
        const buffer = await page.screenshot({ type: 'png', fullPage: false });
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-cache',
          },
        });
      }

      case 'status': {
        const info = await bm.getBrowserInfo();
        return NextResponse.json({
          running: info.connected && info.hasPage,
          url: info.url,
          title: info.title,
        });
      }

      case 'stream': {
        // SSE 端点：每 2 秒推送截图
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            let closed = false;

            const safeClose = () => {
              if (closed) return;
              closed = true;
              clearInterval(interval);
              clearTimeout(autoCloseTimer);
              try { controller.close(); } catch {}
            };

            // 立即发送一次
            (async () => {
              try {
                const base64 = await bm.screenshot();
                const info = await bm.getBrowserInfo();
                const data = JSON.stringify({
                  screenshot: `data:image/png;base64,${base64}`,
                  url: info.url,
                  title: info.title,
                });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              } catch {
                // 首次截图失败，忽略
              }
            })();

            // 每 2 秒推送截图
            const interval = setInterval(async () => {
              if (closed) return;
              try {
                const info = await bm.getBrowserInfo();
                if (!info.connected || !info.hasPage) {
                  safeClose();
                  return;
                }

                const base64 = await bm.screenshot();
                const data = JSON.stringify({
                  screenshot: `data:image/png;base64,${base64}`,
                  url: info.url,
                  title: info.title,
                });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              } catch {
                // 截图失败，继续尝试
              }
            }, 2000);

            // 60 秒后自动关闭
            const autoCloseTimer = setTimeout(() => {
              safeClose();
            }, 60000);

            // 监听客户端断开
            request.signal.addEventListener('abort', safeClose);
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }

      case 'screencast': {
        // CDP Screencast：实时屏幕录制（30fps+ 流畅画面）
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            let closed = false;

            (async () => {
              try {
                const stop = await bm.startScreencast((frameData) => {
                  if (closed) return;
                  const data = JSON.stringify({
                    type: 'screencast',
                    frame: `data:image/jpeg;base64,${frameData}`,
                  });
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                });

                // 监听连接关闭
                const checkInterval = setInterval(() => {
                  // 如果客户端断开，停止 screencast
                }, 5000);

                // 5 分钟后自动停止（防止长时间占用）
                const autoCloseTimer = setTimeout(() => {
                  closed = true;
                  clearInterval(checkInterval);
                  stop();
                  try { controller.close(); } catch {}
                }, 300000);
              } catch (error: any) {
                logger.error('SYSTEM', '[Browser API] Screencast 启动失败', { extra: { error: String(error.message) } });
                try { controller.close(); } catch {}
              }
            })();
          },
          cancel() {
            // 客户端断开时自动清理
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }

      default:
        return NextResponse.json({ success: false, error: `未知操作: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    logger.error('SYSTEM', '[Browser API] GET 错误', { extra: { error: String(error) } });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

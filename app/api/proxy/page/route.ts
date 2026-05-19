import { NextRequest, NextResponse } from 'next/server';
import { permissionController } from '../../../../src/services/agent/permissionController';
import { configStore } from '../../../../src/lib/configStore';
import { logger } from '../../../../src/lib/logger';

// 缓存已抓取的网页
const pageCache = new Map<string, { html: string; timestamp: number }>();

export async function GET(request: NextRequest) {
  try {
    // 读取缓存配置
    const systemConfig = configStore.getGroup('system');
    const cacheEnabled = systemConfig?.cacheEnabled !== false;
    const cacheTTL = ((systemConfig?.cacheTTL || 3600)) * 1000; // 秒 → 毫秒
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 });
    }

    // 检查 URL 是否在白名单中
    const permission = permissionController.isUrlAllowed(url);
    if (!permission.allowed) {
      return NextResponse.json({ error: permission.reason }, { status: 403 });
    }

    // 检查缓存
    const cached = cacheEnabled && pageCache.get(url);
    if (cached && Date.now() - cached.timestamp < cacheTTL) {
      return new Response(cached.html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 抓取网页
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `抓取失败: HTTP ${response.status}` },
        { status: response.status }
      );
    }

    let html = await response.text();
    const finalUrl = response.url || url;

    // 注入 <base> 标签，让相对路径资源正确加载
    const baseTag = `<base href="${finalUrl}" target="_self">`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${baseTag}`);
    } else if (html.includes('<HEAD>')) {
      html = html.replace('<HEAD>', `<HEAD>${baseTag}`);
    } else {
      html = baseTag + html;
    }

    // 注入自定义样式，让页面在iframe中显示更好
    const customStyle = `
<style>
  /* 优化页面在 iframe 中的显示 */
  body {
    margin: 0 !important;
    padding: 0 !important;
    overflow: auto !important;
  }
  /* 限制最大宽度 */
  .wrapper, .container, #wrapper {
    max-width: 100% !important;
    margin: 0 auto !important;
  }
</style>`;
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${customStyle}</head>`);
    } else {
      html = customStyle + html;
    }

    // 缓存
    if (cacheEnabled) {
      pageCache.set(url, { html, timestamp: Date.now() });

      // 清理过期缓存
      for (const [key, val] of pageCache.entries()) {
        if (Date.now() - val.timestamp > cacheTTL) {
          pageCache.delete(key);
        }
      }
    }

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    logger.error('BROWSER', '抓取网页失败', { extra: { error: String(error) } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { browserManager } from '@/services/agent/browserManager';
import { logger } from '../../../../src/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, action, x, y, text, fromX, fromY, toX, toY } = body;

    // 获取浏览器页面
    const page = await (browserManager as any).getPage?.();
    if (!page) {
      return NextResponse.json({ error: '浏览器未启动' }, { status: 400 });
    }

    // 获取页面尺寸用于坐标转换
    const viewport = page.viewportSize() || { width: 1280, height: 800 };
    const absX = Math.round((x / 100) * viewport.width);
    const absY = Math.round((y / 100) * viewport.height);

    switch (action) {
      case 'click': {
        await page.mouse.click(absX, absY);
        // 截图返回新状态
        const screenshot = await page.screenshot({ type: 'png' });
        const base64 = `data:image/png;base64,${screenshot.toString('base64')}`;
        return NextResponse.json({ success: true, screenshot: base64 });
      }
      case 'type': {
        // 先点击输入框位置
        await page.mouse.click(absX, absY);
        await new Promise(r => setTimeout(r, 200));
        // 清空并输入文字
        await page.keyboard.press('Control+a');
        await new Promise(r => setTimeout(r, 50));
        await page.keyboard.type(text);
        const screenshot = await page.screenshot({ type: 'png' });
        const base64 = `data:image/png;base64,${screenshot.toString('base64')}`;
        return NextResponse.json({ success: true, screenshot: base64 });
      }
      case 'drag': {
        const fromAbsX = Math.round((fromX / 100) * viewport.width);
        const fromAbsY = Math.round((fromY / 100) * viewport.height);
        const toAbsX = Math.round((toX / 100) * viewport.width);
        const toAbsY = Math.round((toY / 100) * viewport.height);
        await page.mouse.move(fromAbsX, fromAbsY);
        await page.mouse.down();
        // 分步移动模拟拖拽
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          const cx = fromAbsX + (toAbsX - fromAbsX) * (i / steps);
          const cy = fromAbsY + (toAbsY - fromAbsY) * (i / steps);
          await page.mouse.move(cx, cy);
          await new Promise(r => setTimeout(r, 50));
        }
        await page.mouse.up();
        const screenshot = await page.screenshot({ type: 'png' });
        const base64 = `data:image/png;base64,${screenshot.toString('base64')}`;
        return NextResponse.json({ success: true, screenshot: base64 });
      }
      default:
        return NextResponse.json({ error: `未知操作: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    logger.error('BROWSER', '操作失败', { extra: { error: String(error) } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

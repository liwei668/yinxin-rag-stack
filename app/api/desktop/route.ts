import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../src/lib/logger';

const DESKTOP_SERVER_URL = process.env.DESKTOP_SERVER_URL || 'http://localhost:8765';

// 桌面控制 API - 通过 HTTP 转发到桌面控制 WebSocket 服务端
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'status';
  const userId = searchParams.get('userId') || '';

  try {
    if (action === 'status') {
      const res = await fetch(`${DESKTOP_SERVER_URL}/status?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === 'screenshot') {
      if (!userId) return NextResponse.json({ error: '缺少 userId' }, { status: 400 });
      const res = await fetch(`${DESKTOP_SERVER_URL}/screenshot?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (data.screenshot) {
        return NextResponse.json({ screenshot: `data:image/png;base64,${data.screenshot}` });
      }
      return NextResponse.json({ error: '无法获取截图，客户端可能未连接' }, { status: 400 });
    }

    return NextResponse.json({ error: `未知操作: ${action}` }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: `桌面服务不可用: ${error.message}` }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, command } = body;

    if (!userId || !command) {
      return NextResponse.json({ error: '缺少 userId 或 command' }, { status: 400 });
    }

    const res = await fetch(`${DESKTOP_SERVER_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, command }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: `桌面服务不可用: ${error.message}` }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../src/lib/logger';

const VNC_HOST = process.env.VNC_HOST || 'localhost';
const VNC_PORT = process.env.VNC_PORT || '5900';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId') || 'default';

  return NextResponse.json({
    success: true,
    vnc: {
      host: VNC_HOST,
      port: parseInt(VNC_PORT) + 1,
      path: `/api/vnc/${userId}`,
      description: 'noVNC WebSocket proxy endpoint',
    },
    note: '需要先安装并运行 VNC 服务器和 websockify 代理',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId } = body;

    if (action === 'status') {
      return NextResponse.json({
        success: true,
        vncAvailable: false,
        message: 'VNC 服务器未配置，请设置 VNC_HOST 和 VNC_PORT 环境变量',
      });
    }

    return NextResponse.json({ success: false, error: '未知操作' });
  } catch (error) {
    return NextResponse.json({ success: false, error: '请求错误' });
  }
}
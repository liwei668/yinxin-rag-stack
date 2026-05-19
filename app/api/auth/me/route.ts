import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '../../../../src/lib/auth';
import { userStore } from '../../../../src/lib/userStore';
import { logger } from '../../../../src/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const authCookie = request.cookies.get('auth_token');
    
    if (!authCookie) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      );
    }

    const payload = verifyToken(authCookie.value);
    if (!payload) {
      return NextResponse.json(
        { error: 'Token已过期或无效' },
        { status: 401 }
      );
    }

    const user = userStore.findOne({ id: payload.userId });
    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'user',
        avatar: user.avatar,
        storagePreference: user.storagePreference,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error) {
    logger.error('SYSTEM', 'Get user info error', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: '获取用户信息失败' },
      { status: 500 }
    );
  }
}

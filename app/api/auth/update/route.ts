import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '../../../../src/lib/auth';
import { userStore } from '../../../../src/lib/userStore';
import { logger } from '../../../../src/lib/logger';

export async function PUT(request: NextRequest) {
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

    const { avatar } = await request.json();
    
    if (!avatar) {
      return NextResponse.json(
        { error: '头像URL不能为空' },
        { status: 400 }
      );
    }

    const updatedUser = userStore.update(payload.userId, { avatar });
    
    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role || 'user',
        avatar: updatedUser.avatar,
        storagePreference: updatedUser.storagePreference,
        createdAt: updatedUser.createdAt,
        lastLoginAt: updatedUser.lastLoginAt,
      },
    });
  } catch (error) {
    logger.error('SYSTEM', 'Update user error', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: '更新用户信息失败' },
      { status: 500 }
    );
  }
}

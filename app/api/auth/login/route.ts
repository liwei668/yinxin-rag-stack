import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, generateToken } from '../../../../src/lib/auth';
import { userStore } from '../../../../src/lib/userStore';
import { configStore } from '../../../../src/lib/configStore';
import { logger } from '../../../../src/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: '邮箱和密码都是必填项' },
        { status: 400 }
      );
    }

    const user = userStore.findOne({ email: email.toLowerCase() });
    if (!user) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: '账户已被禁用' },
        { status: 403 }
      );
    }

    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: '密码错误' },
        { status: 401 }
      );
    }

    userStore.update(user.id, { lastLoginAt: new Date() });

    const token = generateToken(user.id, user.role || 'user');

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'user',
        avatar: user.avatar,
        storagePreference: user.storagePreference,
      },
    });

    // 读取会话超时配置（秒），默认 86400（1天）
    const systemConfig = configStore.getGroup('system');
    const sessionTimeout = systemConfig?.sessionTimeout || 86400;

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: sessionTimeout,
      path: '/',
    });

    return response;
  } catch (error) {
    logger.error('SYSTEM', 'Login error', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: '登录失败，请稍后重试' },
      { status: 500 }
    );
  }
}

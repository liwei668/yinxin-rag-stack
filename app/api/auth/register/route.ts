import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, generateToken } from '../../../../src/lib/auth';
import { userStore } from '../../../../src/lib/userStore';
import { configStore } from '../../../../src/lib/configStore';
import { logger } from '../../../../src/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // 检查是否允许注册
    const systemConfig = configStore.getGroup('system');
    if (systemConfig && !systemConfig.enableUserRegistration) {
      return NextResponse.json(
        { error: '管理员已关闭用户注册' },
        { status: 403 }
      );
    }

    const { username, email, password } = await request.json();

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: '用户名、邮箱和密码都是必填项' },
        { status: 400 }
      );
    }

    if (username.length < 2 || username.length > 50) {
      return NextResponse.json(
        { error: '用户名长度应在2-50个字符之间' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: '密码长度至少为6个字符' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: '请输入有效的邮箱地址' },
        { status: 400 }
      );
    }

    const existingUser = userStore.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { error: '该邮箱已被注册' },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(password);
    const userId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

    const userData = {
      id: userId,
      username: username.trim(),
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'user',
      storagePreference: 'hybrid',
      avatar: '',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const user = userStore.create(userData);

    const token = generateToken(user.id, user.role);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        storagePreference: user.storagePreference,
      },
    });

    // 读取会话超时配置（秒），默认 86400（1天）
    const sysConfig = configStore.getGroup('system');
    const sessionTimeout = sysConfig?.sessionTimeout || 86400;

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: sessionTimeout,
      path: '/',
    });

    return response;
  } catch (error) {
    logger.error('SYSTEM', 'Register error', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: '注册失败，请稍后重试' },
      { status: 500 }
    );
  }
}

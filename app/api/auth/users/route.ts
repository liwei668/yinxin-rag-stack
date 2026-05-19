import { NextResponse } from 'next/server';
import { userStore } from '../../../../src/lib/userStore';
import { logger } from '../../../../src/lib/logger';

export async function GET() {
  try {
    const users = userStore.getAll();
    // 不返回密码
    const safeUsers = users.map((user: any) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      storagePreference: user.storagePreference,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    }));
    
    return NextResponse.json({
      success: true,
      count: users.length,
      users: safeUsers,
    });
  } catch (error) {
    logger.error('SYSTEM', 'Get users error', { extra: { error: String(error) } });
    return NextResponse.json(
      { error: '获取用户列表失败' },
      { status: 500 }
    );
  }
}

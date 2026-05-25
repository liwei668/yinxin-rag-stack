// 统一认证中间件
// 所有需要用户认证的 API 路由使用

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '../lib/auth';

export interface AuthUser {
  userId: string;
  role: string;
  exp: number;
}

/**
 * 从请求中提取并验证用户
 */
export async function getUserFromRequest(req: NextRequest): Promise<AuthUser | null> {
  const authCookie = req.cookies.get('auth_token');
  if (!authCookie) return null;
  
  const payload = verifyToken(authCookie.value);
  if (!payload || payload.exp < Date.now()) return null;
  
  return payload as AuthUser;
}

/**
 * 统一认证中间件
 * 自动验证 Token，并将用户信息附加到请求
 */
export function withAuth(
  handler: (req: NextRequest & { user: AuthUser }) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const user = await getUserFromRequest(req);
    
    if (!user) {
      return NextResponse.json({ error: '未登录或Token已过期' }, { status: 401 });
    }
    
    // 将用户信息附加到请求
    (req as any).user = user;
    
    return handler(req as NextRequest & { user: AuthUser });
  };
}

/**
 * 管理员权限中间件
 * 仅允许管理员访问
 */
export function withAdmin(
  handler: (req: NextRequest & { user: AuthUser }) => Promise<NextResponse>
) {
  return withAuth(async (req) => {
    if (req.user.role !== 'admin') {
      return NextResponse.json({ error: '权限不足，需要管理员权限' }, { status: 403 });
    }
    return handler(req);
  });
}

/**
 * 可选认证中间件
 * 已登录返回用户信息，未登录返回 null，不阻断请求
 */
export function withOptionalAuth(
  handler: (req: NextRequest & { user: AuthUser | null }) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const user = await getUserFromRequest(req);
    (req as any).user = user;
    return handler(req as NextRequest & { user: AuthUser | null });
  };
}
